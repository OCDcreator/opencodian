import * as path from 'node:path';

import type { ContextUsageSnapshot, StreamChunk } from '../../../types/chat';
import type { PiBackendSettings } from '../../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../../AgentCapability';
import type { AgentChatCapability, AgentChatSendRequest, AgentConnectionStatus, AgentForkCapability, AgentModelCapability, AgentSessionCapability, Disposable, StatusChangeHandler } from '../AgentService';
import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS, type PiCommandName, type PiModelInfo, type PiServiceEvent, type PiUiHandler } from './PiProtocol';
import { type PiLaunchOptions, type PiRecord, piRecord, type PiRpcPort } from './PiRpcClient';
import { PiSessionRuntime } from './PiSessionRuntime';
import { type PiSessionInfo, PiSessionStore } from './PiSessionStore';
import { buildPiPrompt, buildPiUsageSnapshot, PiStreamMapper } from './PiStreamMapper';

export type { PiModelInfo } from './PiProtocol';
export interface PiAdapterOptions {
  workingDirectory: string;
  sessionDirectory?: string;
  servicePath?: string;
  getSettings?: () => PiBackendSettings;
  createClient?: (options: PiLaunchOptions) => PiRpcPort;
  onUiRequest?: PiUiHandler;
}

/** AgentService facade. Per-session SDK services own execution and native state. */
export class PiAdapter implements AgentChatCapability, AgentSessionCapability, AgentModelCapability, AgentForkCapability {
  readonly kind = 'pi' as const;
  readonly displayName = 'Pi';
  readonly description = 'Official Pi SDK · independent local service';
  readonly capabilities: BackendCapabilities = new Set([
    AgentCapability.Chat, AgentCapability.Sessions, AgentCapability.Tools, AgentCapability.Models,
    AgentCapability.FileOps, AgentCapability.Shell, AgentCapability.Images, AgentCapability.CostTracking,
    AgentCapability.Fork, AgentCapability.Context, AgentCapability.Compaction, AgentCapability.Thinking, AgentCapability.Export,
  ]);
  private currentStatus: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>();
  private readonly sessionLocks = new Set<string>();
  private readonly store: PiSessionStore;
  private readonly runtime: PiSessionRuntime;
  private defaultModel: { provider: string; model: string } | null = null;
  private startPromise: Promise<void> | null = null;
  private generation = 0;
  private readonly runs = new Map<string, { cancelled: boolean; client?: PiRpcPort }>();

  constructor(private readonly options: PiAdapterOptions) {
    this.store = new PiSessionStore(options.sessionDirectory ?? path.join(options.workingDirectory, '.pi', 'opencodian-sessions'));
    this.runtime = new PiSessionRuntime({ ...options, sessionDirectory: this.store.directory, servicePath: options.servicePath ?? '' });
  }
  get status(): AgentConnectionStatus { return this.currentStatus; }
  get processCount(): number { return this.runtime.size; }
  hasCapability(cap: AgentCapability): boolean { return this.capabilities.has(cap); }
  getDefaultModel(): { provider: string; model: string } | null {
    const settings = this.options.getSettings?.();
    return settings?.provider && settings.model ? { provider: settings.provider, model: settings.model } : this.defaultModel;
  }
  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler); return { dispose: () => { this.statusHandlers.delete(handler); } };
  }
  onEvent(handler: (sessionId: string, event: PiServiceEvent) => void): Disposable {
    return { dispose: this.runtime.onEvent(handler) };
  }
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.setStatus('connecting');
    const generation = this.generation;
    this.startPromise = this.command(undefined, 'get_state').then((state) => {
      if (generation !== this.generation) throw new Error('Pi startup was stopped.');
      const model = piRecord(state.model);
      this.defaultModel = typeof model.provider === 'string' && typeof model.id === 'string' ? { provider: model.provider, model: model.id } : null;
      this.setStatus('connected');
    }).catch((error) => { if (generation === this.generation) this.setStatus('error'); throw error; })
      .finally(() => { this.startPromise = null; });
    return this.startPromise;
  }
  async stop(): Promise<void> { this.generation++; this.runtime.closeAll(); this.setStatus('disconnected'); }
  dispose(): void { this.generation++; this.runtime.dispose(); this.setStatus('disconnected'); this.statusHandlers.clear(); }

  /** Allowlisted SDK operations used by the Pi workbench, never arbitrary method reflection. */
  async command(sessionId: string | undefined, type: PiCommandName, input: PiRecord = {}): Promise<PiRecord> {
    if (![...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS].includes(type)) throw new Error('Unknown Pi operation.');
    const info = sessionId ? await this.requireSession(sessionId) : undefined;
    const isConfiguration = (PI_CONFIG_COMMANDS as readonly string[]).includes(type);
    const client = await this.runtime.get(isConfiguration ? 'configuration' : sessionId ?? 'catalog', info ? this.nativePath(info) : undefined);
    if (type === 'switch_session') input = { ...input, sessionPath: this.store.validateNativePath(String(input.sessionPath)) };
    const result = await client.request({ ...input, type }, ['compact', 'prompt', 'login', 'bash', 'navigate_tree', 'install_package', 'update_package', 'remove_package', 'reload', 'new_session', 'switch_session', 'import_session', 'fork', 'clone', 'set_model', 'cycle_model'].includes(type) ? 0 : 30000);
    if (sessionId && !result.cancelled && ['new_session', 'switch_session', 'import_session', 'set_session_name', 'navigate_tree'].includes(type)) await this.bindNativeState(sessionId);
    return result;
  }
  async createSession(title = 'New Pi chat'): Promise<string> {
    const info = await this.store.create(title);
    try {
      await this.command(info.id, 'new_session');
      await this.bindNativeState(info.id);
      await this.command(info.id, 'set_session_name', { name: title });
      return info.id;
    } catch (error) { this.runtime.close(info.id); await this.store.remove(info.id); throw error; }
  }
  listSessions(): Promise<PiSessionInfo[]> { return this.store.list(); }
  getSession(id: string): Promise<PiSessionInfo | null> { return this.store.get(id); }
  async getSessionMessages(id: string): Promise<unknown[]> {
    const result = await this.command(id, 'get_messages');
    return Array.isArray(result.entries) ? result.entries : Array.isArray(result.messages) ? result.messages : [];
  }
  async deleteSession(id: string): Promise<void> {
    await this.exclusive(id, async () => { this.runtime.close(id); await this.store.remove(id); });
  }
  async updateSessionTitle(id: string, title: string): Promise<void> {
    await this.exclusive(id, async () => {
      await this.command(id, 'set_session_name', { name: title });
      await this.store.save({ ...await this.requireSession(id), title, updatedAt: Date.now() });
    });
  }
  async forkSession(id: string, messageId?: string): Promise<{ id: string; title: string }> {
    return this.exclusive(id, async () => {
      const original = await this.requireSession(id);
      const result = await this.command(id, messageId ? 'fork' : 'clone', messageId ? { entryId: messageId } : {});
      if (result.cancelled) throw new Error('Pi fork cancelled.');
      try {
        const state = await this.command(id, 'get_state');
        return await this.store.adoptNative(String(state.sessionFile), `${original.title} (fork)`);
      } finally {
        await this.command(id, 'switch_session', { sessionPath: this.nativePath(original) });
      }
    });
  }
  async importSession(sessionPath: string): Promise<string> {
    const id = await this.createSession('Imported Pi session');
    try {
      const result = await this.command(id, 'import_session', { sessionPath });
      if (result.cancelled) throw new Error('Pi import cancelled.');
      await this.bindNativeState(id); return id;
    } catch (error) { await this.deleteSession(id); throw error; }
  }
  async getAvailableModels(): Promise<PiModelInfo[]> {
    const result = await this.command(undefined, 'get_available_models');
    if (!Array.isArray(result.models)) throw new Error('Invalid Pi model catalog.');
    return result.models as PiModelInfo[];
  }
  async getProviderDirectory(): Promise<string[]> { return [...new Set((await this.getAvailableModels()).map((m) => m.provider))]; }
  async getResolvedModelConfig(): Promise<unknown> { return this.command(undefined, 'get_state'); }
  async getRuntimeCommands(): Promise<Array<{ name: string; description?: string }>> {
    const data = await this.command(undefined, 'get_commands');
    return Array.isArray(data.commands) ? data.commands as Array<{ name: string; description?: string }> : [];
  }
  async getSessionContextUsageSnapshot(id: string): Promise<ContextUsageSnapshot> {
    const [stats, state] = await Promise.all([this.command(id, 'get_session_stats'), this.command(id, 'get_state')]);
    return buildPiUsageSnapshot(id, stats, state);
  }
  async compactSession(id: string, customInstructions?: string): Promise<boolean> {
    await this.command(id, 'compact', { customInstructions }); return true;
  }
  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const id = request.sessionId;
    if (this.sessionLocks.has(id)) throw new Error('Pi session is busy.');
    this.sessionLocks.add(id);
    const run: { cancelled: boolean; client?: PiRpcPort } = { cancelled: false };
    this.runs.set(id, run);
    const generation = this.generation;
    try {
      const info = await this.requireSession(id);
      const client = await this.runtime.get(id, this.nativePath(info));
      run.client = client;
      if (generation !== this.generation || run.cancelled) return;
      await this.prepareModel(client, request);
      if (run.cancelled || generation !== this.generation) return;
      const mapper = new PiStreamMapper(id);
      yield* this.consumeRequest(client, request, mapper);
      const messages = await client.request({ type: 'get_messages' });
      const entries = Array.isArray(messages.entries) ? messages.entries.map(piRecord) : [];
      const user = [...entries].reverse().find((entry) => entry.role === 'user');
      if (typeof user?.id === 'string') yield { type: 'user_message_identity', uuid: user.id, sessionId: id };
      const assistant = [...entries].reverse().find((entry) => entry.role === 'assistant');
      if (typeof assistant?.id === 'string') yield { type: 'message_metadata', messageId: assistant.id, timestamp: Number(assistant.timestamp) || Date.now(), sessionId: id };
      yield { type: 'context_usage', snapshot: await this.getSessionContextUsageSnapshot(id) };
      yield { type: 'message_stop' };
      await this.bindNativeState(id);
    } catch (error) { if (generation === this.generation) throw error; }
    finally { this.runs.delete(id); this.sessionLocks.delete(id); }
  }
  async cancelStream(id: string): Promise<void> {
    const run = this.runs.get(id);
    if (run) {
      run.cancelled = true;
      if (!run.client) { this.runtime.close(id); return; }
      try { await run.client.request({ type: 'abort' }, 5000); }
      catch { this.runtime.close(id); }
      const deadline = setTimeout(() => { if (this.runs.get(id) === run) this.runtime.close(id); }, 5000);
      deadline.unref?.();
    } else await this.command(id, 'abort');
  }
  /** Explicit workbench stop also terminates non-agent operations such as OAuth/package work. */
  stopSession(id?: string): void { this.runtime.close(id || 'catalog'); }

  private async prepareModel(client: PiRpcPort, request: AgentChatSendRequest): Promise<void> {
    const settings = this.options.getSettings?.();
    const provider = String(request.options?.provider ?? settings?.provider ?? '');
    const modelId = String(request.options?.model ?? settings?.model ?? '');
    if (Boolean(provider) !== Boolean(modelId)) throw new Error('Select both a Pi provider and model.');
    if (provider && modelId) await client.request({ type: 'set_model', provider, modelId }, 0);
    if (this.runs.get(request.sessionId)?.cancelled) return;
    const thinking = request.options?.variant ?? settings?.thinkingLevel;
    if (thinking) await client.request({ type: 'set_thinking_level', level: thinking });
  }

  private async *consumeRequest(client: PiRpcPort, request: AgentChatSendRequest, mapper: PiStreamMapper): AsyncGenerator<StreamChunk> {
    const queue: PiRecord[] = [];
    let wake: (() => void) | undefined;
    const enqueue = (event: PiRecord): void => { queue.push(event); wake?.(); };
    const unsubscribe = client.subscribe(enqueue);
    let completed = false;
    let failure: Error | undefined;
    const pending = client.request(buildPiPrompt(request), 0).catch((error) => { failure = error instanceof Error ? error : new Error(String(error)); })
      .finally(() => { completed = true; wake?.(); });
    try {
      while (!completed || queue.length) {
        if (!queue.length && !completed) await new Promise<void>((resolve) => { wake = resolve; });
        wake = undefined;
        while (queue.length) for (const chunk of mapper.map(queue.shift() as PiRecord)) yield chunk;
      }
      if (failure) throw failure;
      const last = await client.request({ type: 'get_last_assistant_text' });
      const history = await client.request({ type: 'get_messages' });
      const finalMessage = Array.isArray(history.messages) ? [...history.messages].reverse().map(piRecord).find((m) => m.role === 'assistant') : undefined;
      if (finalMessage?.stopReason === 'error') yield { type: 'error', content: String(finalMessage.errorMessage ?? 'Pi request failed.') };
      if (!mapper.hasText && typeof last.text === 'string' && last.text && mapper.sawAssistant) yield { type: 'text', content: last.text };
    } finally {
      unsubscribe();
      if (!completed) {
        const forceClose = setTimeout(() => client.close(), 5000);
        try { void client.request({ type: 'abort' }, 5000).catch(() => client.close()); await pending; }
        finally { clearTimeout(forceClose); }
      }
    }
  }
  private nativePath(info: PiSessionInfo): string { return info.sessionFile ? this.store.validateNativePath(info.sessionFile) : this.store.sessionPath(info.id); }
  private async bindNativeState(id: string): Promise<void> {
    const state = await this.command(id, 'get_state');
    const info = await this.requireSession(id);
    const sessionFile = typeof state.sessionFile === 'string' ? this.store.validateNativePath(state.sessionFile) : info.sessionFile;
    await this.store.save({ ...info, sessionFile, title: typeof state.sessionName === 'string' ? state.sessionName : info.title, updatedAt: Date.now() });
  }
  private async requireSession(id: string): Promise<PiSessionInfo> {
    const info = await this.store.get(id); if (!info) throw new Error('Pi session not found.'); return info;
  }
  private async exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    if (this.sessionLocks.has(id)) throw new Error('Pi session is busy.');
    this.sessionLocks.add(id); try { return await action(); } finally { this.sessionLocks.delete(id); }
  }
  private setStatus(status: AgentConnectionStatus): void {
    this.currentStatus = status; for (const handler of this.statusHandlers) { try { handler(status); } catch { /* Observer isolation. */ } }
  }
}
