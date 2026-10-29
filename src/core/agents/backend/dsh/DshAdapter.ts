/* eslint-disable max-lines -- DSH session lifecycle, ACP mapping, and fail-closed recovery stay in one adapter boundary. */
import { appendObsidianContextBlocks } from '../../../../shared/obsidianContext';
import { backendSessionCatalogFailure, BackendSessionCatalogReadError } from '../../../../shared/sessionCatalogReadback';
import { prependMemoryInjection } from '../../../memory';
import { prependObsidianToolingInjection } from '../../../obsidianTooling';
import type { ContextUsageSnapshot, StreamChunk } from '../../../types/chat';
import type { DshBackendSettings } from '../../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../../AgentCapability';
import type { AgentAuxQueryCapability, AuxQuerySession, AuxQuerySessionConfig } from '../AgentAuxQueryCapability';
import type { AgentInlineCompletionCapability, InlineCompletionSession, InlineCompletionSessionConfig } from '../AgentInlineCompletionCapability';
import { INLINE_COMPLETION_TURN_TIMEOUT_MS } from '../AgentInlineCompletionCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentForkCapability,
  AgentModelCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentSessionCapability,
  AgentToolCapability,
  AgentTurnSteeringCapability,
  CapabilityChangeHandler,
  Disposable,
  StatusChangeHandler,
} from '../AgentService';
import { WarmInlineCompletionSession } from '../auxiliary/WarmInlineCompletionSession';
import {
  DshAcpClient,
  type DshAcpClientOptions,
  type DshAcpPermissionRequest,
  type DshAcpPermissionResponse,
  type DshAcpUpdate,
  type DshJsonObject,
  resolveDshLaunch,
  validateDshMcpServers,
} from './DshAcpClient';
import { DshAuxQuerySession } from './DshAuxQuerySession';
import { DshNativeClient } from './DshNativeClient';
import { dshContentBlockText, prepareDshPromptBlocks } from './DshProtocolCodec';
import { DshQuestionBridge } from './DshQuestionBridge';

const CAPABILITIES: BackendCapabilities = Object.freeze(new Set([
  AgentCapability.Chat,
  AgentCapability.Sessions,
  AgentCapability.Permissions,
  AgentCapability.Thinking,
  AgentCapability.Models,
  AgentCapability.Context,
]));

interface TurnState {
  selection: { provider: string; model: string } | null;
  readonly sessionId: string; readonly generation: number;
  readonly chunks: StreamChunk[]; readonly waiters: Array<() => void>;
  readonly nativeSettled: Promise<void>; readonly settleNative: () => void;
  done: boolean; cancelled: boolean; promptStarted: boolean; requiresRecovery: boolean; error: Error | null;
}

interface PendingPermission {
  readonly id: string; readonly sessionId: string; readonly permission: string;
  readonly options: DshAcpPermissionRequest['options'];
  readonly resolve: (response: DshAcpPermissionResponse) => void;
}

type DshClientPort = Pick<DshAcpClient,
  'isStarted' | 'handshake' | 'start' | 'stop' | 'newSession' | 'listSessions' | 'resumeSession' | 'closeSession' | 'prompt' | 'cancel' | 'setConfigOption'>
  & Partial<Pick<DshNativeClient, 'nativeRequest'>>;

export interface DshModelSelectorProvider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; variants: string[] }>;
}

export interface DshAdapterOptions {
  readonly workingDirectory: string;
  readonly getSettings: () => DshBackendSettings;
  readonly getExtraEnv?: () => Readonly<Record<string, string>>;
  readonly createClient?: (options: DshAcpClientOptions) => DshClientPort;
  readonly cancelTimeoutMs?: number;
}

/** First-class DeepSeek Harness backend over the documented ACP stdio profile. */
export class DshAdapter implements AgentService, AgentChatCapability, AgentSessionCapability, AgentPermissionCapability, AgentModelCapability, AgentAuxQueryCapability, AgentInlineCompletionCapability, AgentQuestionCapability, AgentForkCapability, AgentTurnSteeringCapability, AgentToolCapability {
  readonly kind = 'dsh' as const;
  readonly displayName = 'DeepSeek Harness';
  readonly description = 'DeepSeek Harness native runtime';
  private readonly auxiliaryText = new Map<string, (text: string) => void>();
  private toolCatalog: unknown[] = [];
  private readonly questions = new DshQuestionBridge((sessionId, chunk) => {
    const state = this.turns.get(sessionId);
    if (!state || state.done || state.cancelled) return false;
    state.chunks.push(chunk); this.wake(state); return true;
  });
  private capabilitiesValue: BackendCapabilities = CAPABILITIES;
  get capabilities(): BackendCapabilities { return this.capabilitiesValue; }
  private readonly capabilityHandlers = new Set<CapabilityChangeHandler>();
  private readonly configurations = new Map<string, DshJsonObject[]>();
  private readonly reasoningDefaults = new Map<string, Map<string, string>>();
  private readonly contextUsage = new Map<string, ContextUsageSnapshot>();
  private reservedSession: { id: string; cwd: string; mcpKey: string } | null = null;
  private catalogPromise: Promise<string> | null = null;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>(); private readonly sessions = new Set<string>();
  private readonly turns = new Map<string, TurnState>(); private readonly permissions = new Map<string, PendingPermission>();
  private readonly turnGenerations = new Map<string, number>(); private readonly resumePromises = new Map<string, Promise<void>>();
  private readonly cancellationPromises = new Map<string, Promise<void>>(); private client: DshClientPort | null = null;
  private startingClient: DshClientPort | null = null; private starting: Promise<void> | null = null;
  private connectionKey: string | null = null;
  private lifecycleGeneration = 0;
  private nextPermissionId = 1;
  private disposed = false;

  constructor(private readonly options: DshAdapterOptions) { this.refreshCapabilities(null); }

  get status(): AgentConnectionStatus { return this.statusValue; } hasCapability(cap: AgentCapability): boolean { return this.capabilities.has(cap); }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return { dispose: () => this.statusHandlers.delete(handler) }; }

  onCapabilitiesChange(handler: CapabilityChangeHandler): Disposable {
    this.capabilityHandlers.add(handler);
    return { dispose: () => this.capabilityHandlers.delete(handler) };
  }

  private refreshCapabilities(handshake: DshJsonObject | null): void {
    const caps = asRecord(handshake?.agentCapabilities);
    const prompt = asRecord(caps?.promptCapabilities);
    this.capabilitiesValue = Object.freeze(new Set([
      ...CAPABILITIES, ...(prompt?.image === true ? [AgentCapability.Images] : []),
      // Logical native features remain startable before connection; each aux
      // construction still requires the native runtime proof before a query.
      ...(handshake?.nativeProtocol === 'opencodian.dsh-native/1' || handshake === null && this.options.getSettings().transport !== 'acp'
        ? [AgentCapability.AuxQuery, AgentCapability.InlineCompletion, AgentCapability.Questions,
          AgentCapability.Fork, AgentCapability.TurnSteering, AgentCapability.Tools, AgentCapability.Compaction] : []),
    ]));
    for (const handler of this.capabilityHandlers) handler(this.capabilitiesValue);
  }

  private clearSessionRuntime(): void {
    this.sessions.clear();
    this.resumePromises.clear();
    this.configurations.clear();
    this.reasoningDefaults.clear();
    // Last-known context usage survives recovery: the native runtime only
    // reports usage on the next assistant message, so zeroing it here would
    // blank the chat's usage display until a fresh turn completes.
    this.reservedSession = null;
    this.catalogPromise = null;
    this.refreshCapabilities(null);
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('DeepSeek Harness backend is disposed');
    if (this.starting) return this.starting;
    const settings = this.options.getSettings();
    const workingDirectory = settings.workingDirectory || this.options.workingDirectory;
    const launch = resolveDshLaunch(settings, this.options.getExtraEnv?.() ?? {});
    const connectionKey = JSON.stringify([settings.transport ?? 'native', workingDirectory, launch.command, launch.args, Object.entries(launch.env).sort(([left], [right]) => left.localeCompare(right))]);
    if (this.client?.isStarted && this.connectionKey === connectionKey) return;
    if (this.client && this.connectionKey !== connectionKey && (this.sessions.size > 0 || this.turns.size > 0)) {
      throw new Error('DeepSeek Harness settings changed; stop the backend before reconnecting active sessions');
    }
    const generation = ++this.lifecycleGeneration;
    const starting = this.startClient(generation, connectionKey, workingDirectory, launch);
    this.starting = starting;
    try { await starting; } finally { if (this.starting === starting) this.starting = null; }
  }

  private async startClient(
    generation: number,
    connectionKey: string,
    workingDirectory: string,
    launch: ReturnType<typeof resolveDshLaunch>,
  ): Promise<void> {
    if (this.client) {
      const previous = this.client;
      this.client = null;
      this.connectionKey = null;
      await previous.stop();
    }
    this.setStatus('connecting');
    const factory = this.options.createClient ?? ((clientOptions: DshAcpClientOptions) => this.options.getSettings().transport === 'acp'
      ? new DshAcpClient(clientOptions) : new DshNativeClient(clientOptions));
    const client: DshClientPort = factory({
      cwd: workingDirectory,
      launch,
      onUpdate: (update) => { if (this.client === client) this.handleUpdate(update); },
      onPermissionRequest: (request) => this.client === client
        ? this.handlePermissionRequest(request)
        : Promise.resolve({ outcome: { outcome: 'cancelled' } }),
      onQuestionRequest: (request) => this.client === client ? this.questions.request(request) : Promise.resolve({ cancelled: true }),
      onProtocolError: (error) => {
        if (this.client === client || this.startingClient === client) this.setStatusError(error);
      },
    });
    this.startingClient = client;
    try {
      await client.start();
      if (generation !== this.lifecycleGeneration || this.startingClient !== client) {
        await client.stop();
        throw new Error('DeepSeek Harness start was cancelled');
      }
      this.client = client;
      this.connectionKey = connectionKey;
      this.refreshCapabilities(client.handshake);
      this.setStatus('connected');
    } catch (error) {
      await client.stop();
      if (generation === this.lifecycleGeneration) this.setStatus('error');
      throw error;
    } finally {
      if (this.startingClient === client) this.startingClient = null;
    }
  }

  async stop(): Promise<void> {
    ++this.lifecycleGeneration;
    const cancellations = [...this.turns.keys()].map((sessionId) => this.cancelStream(sessionId));
    this.cancelAllPermissions();
    const clients = new Set([this.client, this.startingClient].filter((client): client is DshClientPort => client !== null));
    this.client = null;
    this.startingClient = null;
    this.connectionKey = null;
    this.clearSessionRuntime();
    const [clientStops] = await Promise.all([
      Promise.allSettled([...clients].map((client) => client.stop())),
      Promise.allSettled(cancellations),
    ]);
    const stopFailure = clientStops.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (stopFailure) {
      this.setStatus('error');
      throw stopFailure.reason instanceof Error ? stopFailure.reason : new Error(String(stopFailure.reason));
    }
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.disposed = true;
    void this.stop().catch(() => undefined);
    this.capabilityHandlers.clear();
    this.statusHandlers.clear(); }

  async createSession(_title?: string, options?: Record<string, unknown>): Promise<string> {
    const client = await this.ready();
    const generation = this.lifecycleGeneration;
    const workingDirectory = this.resolveWorkingDirectory(options);
    const resumeSessionId = typeof options?.resumeSessionId === 'string' ? options.resumeSessionId.trim() : '';
    if (resumeSessionId) {
      const response = await client.resumeSession(resumeSessionId, workingDirectory, this.getMcpServers());
      this.assertCurrentClient(client, generation);
      this.sessions.add(resumeSessionId);
      this.rememberConfiguration(resumeSessionId, response, true);
      return resumeSessionId;
    }
    await this.catalogPromise;
    const reserved = this.reservedSession;
    if (reserved && reserved.cwd === workingDirectory && reserved.mcpKey === JSON.stringify(this.getMcpServers())) {
      this.assertCurrentClient(client, generation);
      this.reservedSession = null;
      return reserved.id;
    }
    const response = await client.newSession(workingDirectory, this.getMcpServers());
    this.assertCurrentClient(client, generation);
    const sessionId = typeof response.sessionId === 'string' ? response.sessionId.trim() : '';
    if (!sessionId) throw new Error('DSH ACP session response did not include a session id');
    this.sessions.add(sessionId);
    this.rememberConfiguration(sessionId, response, true);
    return sessionId;
  }

  async listSessions(): Promise<unknown[]> {
    const client = await this.ready();
    const rows = new Map<string, DshJsonObject>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    const fail = (errorReason: string, status: 'failed' | 'unavailable' = 'failed'): never => {
      throw new BackendSessionCatalogReadError({
        status: rows.size ? 'partial' : status,
        data: [...rows.values()],
        nextCursor: cursor ?? null,
        errorReason,
      });
    };
    for (let pageCount = 0; pageCount < 100; pageCount += 1) {
      const page = await client.listSessions(this.resolveWorkingDirectory(), cursor).catch((error: unknown) => {
        const failure = backendSessionCatalogFailure(error);
        return fail(failure.errorReason, failure.status);
      });
      const sessions = page.sessions;
      if (!Array.isArray(sessions)) return fail('Invalid session catalog response');
      for (const value of sessions) {
        const record = asRecord(value);
        const sessionId = typeof record?.sessionId === 'string' ? record.sessionId.trim() : '';
        if (!record || !sessionId) return fail('Invalid session catalog identity');
        if (!rows.has(sessionId)) {
          // The native catalog emits ISO strings; routing/detail consumers
          // (extractTimestamp, normalized rows) only accept epoch millis.
          rows.set(sessionId, {
            ...record,
            id: sessionId,
            createdAt: toEpochMillis(record.createdAt) ?? record.createdAt,
            updatedAt: toEpochMillis(record.updatedAt) ?? record.updatedAt,
          });
        }
      }
      const nextCursor = page.nextCursor;
      if (nextCursor === undefined) return [...rows.values()];
      if (typeof nextCursor !== 'string' || !nextCursor.trim()) return fail('Invalid session catalog cursor');
      if (seenCursors.has(nextCursor)) return fail('Session catalog cursor repeated');
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return fail('Session catalog page limit exceeded');
  }

  async deleteSession(_sessionId: string): Promise<void> {
    throw new Error('DSH ACP does not support deleting persisted sessions');
  }

  /**
   * Manual compaction over the native compaction seam (the same one /compact
   * rides). Returns true when the compaction ran — including the "no
   * compactable history yet" no-op; manual-compaction failures (busy, changed
   * history, summary, commit, persistence) throw with the harness message.
   */
  async compactSession(sessionId: string): Promise<boolean> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH compaction requires the native transport');
    await this.ensureSessionActive(client, sessionId);
    if (this.turns.has(sessionId)) throw new Error('DSH compaction requires an idle session');
    try {
      await client.nativeRequest('session/compact', { sessionId }, 180_000);
    } catch (error) {
      // A timed-out request leaves the summary possibly still running in the
      // harness; notify cancellation (which aborts the compact admission) so
      // the session does not stay busy until the late attempt finishes. Any
      // other failure is a business error and keeps the connection alive.
      if (error instanceof Error && /timed out/.test(error.message)) client.cancel(sessionId);
      throw error;
    }
    return true;
  }

  async getSession(sessionId: string): Promise<DshJsonObject | null> {
    // Title/timestamp metadata comes from the harness title snapshots behind the
    // same catalog the session browser reads; there is no single-session read.
    const rows = await this.listSessions();
    const match = rows.map((row) => asRecord(row)).find((row) => row && String(row.id) === sessionId);
    return match ? { ...match } : null;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH ACP does not expose session title mutation');
    await this.ensureSessionActive(client, sessionId);
    await client.nativeRequest('session/title', { sessionId, title });
  }

  async getSessionMessages(sessionId: string): Promise<unknown[]> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH ACP does not expose session history');
    const result = await client.nativeRequest('session/history', { sessionId });
    if (!Array.isArray(result.messages)) throw new Error('Harness returned an invalid transcript');
    return result.messages.flatMap<unknown>((value) => {
      const message = asRecord(value);
      if (!message || !Array.isArray(message.content)) throw new Error('Harness returned an invalid transcript message');
      if (message.role === 'user' && message.sourceKind && message.sourceKind !== 'user') return [];
      if (message.role === 'tool') {
        return [{ id: message.id, info: { id: message.id, role: 'activity' }, parts: [{ type: 'text',
          text: `Tool ${String(message.toolCallId ?? '')}${message.isError ? ' failed' : ' result'}:\n`
            + message.content.map((block) => dshContentBlockText(asRecord(block))).filter(Boolean).join('\n') }] }];
      }
      return [{ ...message, content: message.content.map((block) => {
        const content = asRecord(block);
        if (content?.type === 'tool-call') {
          let input: DshJsonObject = {};
          try { input = asRecord(typeof content.arguments === 'string' ? JSON.parse(content.arguments) : content.arguments) ?? {}; } catch { input = { rawInput: String(content.arguments ?? '') }; }
          return { type: 'tool_use', id: String(content.id ?? content.callId ?? ''), name: String(content.name ?? 'tool'), input };
        }
        return content?.type === 'image' ? { type: 'text', text: dshContentBlockText(content) } : content;
      }) }];
    });
  }

  async startAuxQuerySession(config: AuxQuerySessionConfig): Promise<AuxQuerySession> {
    return this.createAuxiliarySession(config, false);
  }

  private async createAuxiliarySession(config: AuxQuerySessionConfig, preferLowLatency: boolean): Promise<AuxQuerySession> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH auxiliary queries require the native transport');
    return DshAuxQuerySession.create(config, (method, params, timeout) => client.nativeRequest!(method, params, timeout),
      (id, handler) => { this.auxiliaryText.set(id, handler); return () => this.auxiliaryText.delete(id); }, preferLowLatency);
  }

  async startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession> {
    const recreate = () => this.createAuxiliarySession({ ...config, turnTimeoutMs: INLINE_COMPLETION_TURN_TIMEOUT_MS }, true);
    return WarmInlineCompletionSession.create({ backend: this.kind, session: await recreate(), recreate });
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('DSH session forks require the native transport');
    const generation = this.lifecycleGeneration;
    const result = await client.nativeRequest('session/fork', { sessionId, cwd: this.resolveWorkingDirectory(),
      mcpServers: this.getMcpServers(), ...(messageID ? { messageId: messageID } : {}) });
    this.assertCurrentClient(client, generation);
    if (typeof result.sessionId !== 'string' || !result.sessionId) throw new Error('Native Harness fork returned no session identity');
    this.sessions.add(result.sessionId); this.rememberConfiguration(result.sessionId, result, true);
    return { id: result.sessionId, title: '' };
  }

  async steerTurn(sessionId: string, text: string): Promise<boolean> {
    const client = await this.ready();
    if (!client.nativeRequest || !this.turns.has(sessionId) || !text.trim()) return false;
    return (await client.nativeRequest('session/steer', { sessionId, text })).accepted === true;
  }

  async getPendingQuestions(): Promise<unknown[]> { return this.questions.list(); }
  async replyToQuestion(id: string, answers: string[][]): Promise<void> { this.questions.reply(id, answers); }
  async rejectQuestion(id: string): Promise<void> { this.questions.reject(id); }

  async listTools(_providerID: string, _modelID: string): Promise<unknown[]> {
    const client = await this.ready();
    if (!client.nativeRequest) return [];
    const sessionId = await this.ensureConfigurationSession(this.reservedSession?.id ?? [...this.sessions][0]);
    const response = await client.nativeRequest('session/tools', { sessionId });
    if (!Array.isArray(response.tools)) throw new Error('Harness returned an invalid tool catalog');
    this.toolCatalog = response.tools;
    return [...this.toolCatalog];
  }
  getToolCatalogSnapshot(): unknown { return [...this.toolCatalog]; }
  getCapabilitySnapshot(): unknown { return { backend: this.kind, capabilities: [...this.capabilities] }; }
  async refreshToolIds(): Promise<string[]> {
    return (await this.listTools('', '')).map((tool) => String((tool as Record<string, unknown>).name ?? '')).filter(Boolean);
  }

  async getRuntimeCommands(forSessionId?: string): Promise<Array<{ name: string; description?: string; source?: string }>> {
    const client = await this.ready();
    if (!client.nativeRequest) return [];
    const sessionId = await this.ensureConfigurationSession(forSessionId ?? this.reservedSession?.id ?? [...this.sessions][0]);
    const result = await client.nativeRequest('session/commands', { sessionId });
    if (!Array.isArray(result.commands)) throw new Error('Harness returned an invalid command catalog');
    return result.commands.flatMap((value) => {
      const command = asRecord(value);
      return typeof command?.name === 'string' ? [{ name: command.name, description: String(command.description ?? ''),
        ...(command.source === 'skill' ? { source: 'skill' } : {}) }] : [];
    });
  }

  async applyMcpConfiguration(): Promise<number> {
    const client = await this.ready();
    if (!client.nativeRequest) throw new Error('Live MCP updates require the native Harness transport');
    if (this.turns.size) throw new Error('Wait for all Harness turns to finish before applying MCP configuration');
    const servers = this.getMcpServers();
    const ids = [...this.sessions];
    try {
      for (const sessionId of ids) await client.nativeRequest('session/mcp', { sessionId, replace: servers }, 60_000);
    } catch (error) {
      if (error instanceof Error && /timed out/.test(error.message)) await this.recoverFromStuckCancellation();
      throw error;
    }
    return ids.length;
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const client = await this.ready();
    if (request.images?.length && !this.hasCapability(AgentCapability.Images))
      throw new Error('DeepSeek Harness did not advertise image prompts for this connection');
    await this.cancellationPromises.get(request.sessionId);
    if (this.turns.has(request.sessionId)) throw new Error('DSH ACP allows only one prompt per session');
    const generation = (this.turnGenerations.get(request.sessionId) ?? 0) + 1;
    this.turnGenerations.set(request.sessionId, generation);
    let settleNative!: () => void;
    const nativeSettled = new Promise<void>((resolve) => { settleNative = resolve; });
    const state: TurnState = {
      selection: null,
      sessionId: request.sessionId,
      generation,
      chunks: [],
      waiters: [],
      nativeSettled,
      settleNative,
      done: false,
      cancelled: false,
      promptStarted: false,
      requiresRecovery: false,
      error: null,
    };
    this.turns.set(request.sessionId, state);
    try {
      const prompt = await prepareDshPromptBlocks(request, {
        prefix: prependObsidianToolingInjection(prependMemoryInjection('', request.options), request.options),
        suffix: appendObsidianContextBlocks('', request.options), supportsImages: this.hasCapability(AgentCapability.Images),
        attachmentRoot: this.options.workingDirectory,
      });
      if (state.cancelled) { state.settleNative(); yield { type: 'message_stop' }; return; }
      await this.ensureSessionActive(client, request.sessionId);
      if (state.cancelled) {
        state.settleNative();
        yield { type: 'message_stop' };
        return;
      }
      await this.applySendConfiguration(client, request.sessionId, request.options ?? {});
      if (state.cancelled) { state.settleNative(); yield { type: 'message_stop' }; return; }
      if (state.done) throw state.error ?? new Error('DSH turn ended before prompt admission');
      state.selection = this.getDefaultModelSelection(request.sessionId);
      yield { type: 'message_start' };
      state.promptStarted = true;
      void this.submitPrompt(client, request, prompt)
        .then(() => { state.done = true; })
        .catch((error: unknown) => {
          state.error = error instanceof Error ? error : new Error(String(error));
          state.requiresRecovery = isTransportUncertainPromptError(state.error);
          state.done = true;
        })
        .finally(() => {
          state.settleNative();
          this.wake(state);
        });

      while (!state.done || state.chunks.length > 0) {
        const next = state.chunks.shift();
        if (next) {
          yield next;
          continue;
        }
        if (state.done) break;
        await new Promise<void>((resolve) => state.waiters.push(resolve));
      }
      if (state.error && !state.cancelled) yield { type: 'error', content: state.error.message };
      yield { type: 'message_stop' };
    } catch (error) {
      state.settleNative();
      const failure = error instanceof Error ? error : new Error(String(error));
      state.requiresRecovery = isTransportUncertainPromptError(failure);
      if (!state.cancelled) yield { type: 'error', content: failure.message };
      yield { type: 'message_stop' };
    } finally {
      await this.finishTurn(state, client);
    }
  }

  private async finishTurn(state: TurnState, client: DshClientPort): Promise<void> {
    try {
      // A detached old generator must never cancel or replace a newer connection/turn.
      if (state.requiresRecovery) {
        if (this.client === client) {
          client.cancel(state.sessionId);
          await this.recoverFromStuckCancellation();
        }
        state.cancelled = true;
      } else if (state.promptStarted && !state.done && !state.cancelled
        && this.turns.get(state.sessionId) === state && this.client === client) {
        await this.cancelStream(state.sessionId);
      }
    } finally {
      if (!state.promptStarted) state.settleNative();
      if (this.turns.get(state.sessionId) === state) this.turns.delete(state.sessionId);
    }
  }

  private submitPrompt(client: DshClientPort, request: AgentChatSendRequest, prompt: DshJsonObject[]): Promise<DshJsonObject> {
    return client.nativeRequest && request.content.trimStart().startsWith('/')
      ? client.nativeRequest('session/prompt', { sessionId: request.sessionId, prompt, rawText: request.content }, 10 * 60_000)
      : client.prompt(request.sessionId, prompt);
  }

  async cancelStream(sessionId: string): Promise<void> {
    const existing = this.cancellationPromises.get(sessionId);
    if (existing) return existing;
    const cancellation = this.cancelSessionTurn(sessionId);
    this.cancellationPromises.set(sessionId, cancellation);
    try { await cancellation; } finally {
      if (this.cancellationPromises.get(sessionId) === cancellation) this.cancellationPromises.delete(sessionId);
    }
  }

  private async cancelSessionTurn(sessionId: string): Promise<void> {
    this.questions.cancel(sessionId);
    const state = this.turns.get(sessionId);
    this.turnGenerations.set(sessionId, (this.turnGenerations.get(sessionId) ?? 0) + 1);
    if (state) {
      state.cancelled = true;
      state.done = true;
      state.chunks.length = 0;
      this.wake(state);
    }
    for (const [id, permission] of this.permissions) {
      if (permission.sessionId === sessionId) {
        permission.resolve({ outcome: { outcome: 'cancelled' } });
        this.permissions.delete(id);
      }
    }
    this.client?.cancel(sessionId);
    if (state) {
      const settled = await settlesWithin(state.nativeSettled, this.options.cancelTimeoutMs ?? 5000);
      if (!settled) await this.recoverFromStuckCancellation();
      if (this.turns.get(sessionId) === state) this.turns.delete(sessionId);
    }
  }

  private async recoverFromStuckCancellation(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.client = null;
    this.connectionKey = null;
    this.clearSessionRuntime();
    this.cancelAllPermissions();
    this.setStatus('error');
    await client.stop();
  }

  async getPendingPermissions(): Promise<unknown[]> {
    return [...this.permissions.values()].map((permission) => ({
      id: permission.id,
      sessionID: permission.sessionId,
      permission: permission.permission,
      patterns: [],
    }));
  }

  async respondToPermission(requestID: string, reply: unknown): Promise<void> {
    if (reply !== 'once' && reply !== 'always' && reply !== 'reject') {
      throw new Error('Invalid DSH permission reply');
    }
    const pending = this.permissions.get(requestID);
    if (!pending) throw new Error('DSH permission request is no longer active');
    // The native Harness offers allow-once/reject-once only. 'always' prefers a
    // persistent allow option when the runtime grows one and otherwise degrades
    // to allow-once — 'always'/'session' persistence within the plugin session
    // is tracked client-side by the permission card renderer, mirroring the
    // zcode reply mapping. Resolving to 'cancelled' here would silently reject
    // the tool. The lookup is ordered by preference, not by option array order.
    const selectByKinds = (kinds: string[]) => pending.options.find((option) => kinds.includes(option.kind ?? ''));
    const selected = reply === 'once' ? selectByKinds(['allow_once'])
      : reply === 'always' ? selectByKinds(['allow_always']) ?? selectByKinds(['allow_once'])
        : selectByKinds(['reject_once', 'reject_always']);
    pending.resolve(selected
      ? { outcome: { outcome: 'selected', optionId: selected.optionId } }
      : { outcome: { outcome: 'cancelled' } });
    this.permissions.delete(requestID);
  }

  private async ready(): Promise<DshClientPort> {
    await this.start();
    if (!this.client) throw new Error('DSH ACP client unavailable');
    return this.client;
  }

  private assertCurrentClient(client: DshClientPort, generation: number): void {
    if (this.client !== client || this.lifecycleGeneration !== generation)
      throw new Error('DeepSeek Harness session activation was superseded');
  }

  private async ensureSessionActive(client: DshClientPort, sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) return;
    const existing = this.resumePromises.get(sessionId);
    if (existing) return existing;
    const generation = this.lifecycleGeneration;
    const resume = client.resumeSession(sessionId, this.resolveWorkingDirectory(), this.getMcpServers())
      .then((response) => {
        if (this.client !== client || this.lifecycleGeneration !== generation) {
          throw new Error('DeepSeek Harness session resume was superseded');
        }
        this.sessions.add(sessionId);
        this.rememberConfiguration(sessionId, response, true);
      })
      .finally(() => { if (this.resumePromises.get(sessionId) === resume) this.resumePromises.delete(sessionId); });
    this.resumePromises.set(sessionId, resume);
    return resume;
  }

  private resolveWorkingDirectory(options?: Record<string, unknown>): string {
    return typeof options?.cwd === 'string' && options.cwd.trim()
      ? options.cwd.trim()
      : this.options.getSettings().workingDirectory || this.options.workingDirectory;
  }

  private setStatus(status: AgentConnectionStatus): void {
    this.statusValue = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private setStatusError(error: Error): void {
    ++this.lifecycleGeneration;
    this.clearSessionRuntime();
    this.connectionKey = null;
    this.cancelAllPermissions();
    this.setStatus('error');
    for (const state of this.turns.values()) {
      state.error = error;
      state.done = true;
      this.wake(state);
    }
  }

  private handleUpdate(update: DshAcpUpdate): void {
    const auxiliary = this.auxiliaryText.get(update.sessionId);
    if (auxiliary) { auxiliary(dshContentBlockText(asRecord(update.update.content))); return; }
    if (update.update.sessionUpdate === 'native_question_closed' && typeof update.update.requestId === 'string') {
      this.questions.reject(`dsh-question-${update.sessionId}-${update.update.requestId}`); return;
    }
    if (update.update.sessionUpdate === 'config_option_update' && this.sessions.has(update.sessionId)) {
      try { this.rememberConfiguration(update.sessionId, update.update); }
      catch { this.setStatusError(new Error('DSH sent invalid session configuration')); }
      return;
    }
    const state = this.turns.get(update.sessionId);
    if (!state || state.cancelled || state.generation !== this.turnGenerations.get(update.sessionId)) return;
    if (update.update.sessionUpdate === 'usage_update') {
      const snapshot = this.acceptContextUsage(update.sessionId, update.update);
      if (snapshot) { state.chunks.push({ type: 'context_usage', snapshot }); this.wake(state); }
      return;
    }
    const chunk = translateDshUpdate(update.update);
    if (chunk) {
      state.chunks.push(chunk);
      this.wake(state);
    }
  }

  private handlePermissionRequest(request: DshAcpPermissionRequest): Promise<DshAcpPermissionResponse> {
    const state = this.turns.get(request.sessionId);
    if (!state || state.cancelled || state.done) return Promise.resolve({ outcome: { outcome: 'cancelled' } });
    const id = `dsh-permission-${this.nextPermissionId++}`;
    const permission = String(request.toolCall.title ?? request.toolCall.name ?? 'tool');
    return new Promise<DshAcpPermissionResponse>((resolve) => {
      this.permissions.set(id, { id, sessionId: request.sessionId, permission, options: request.options, resolve });
      state.chunks.push({
        type: 'permission_request',
        id,
        sessionID: request.sessionId,
        permission,
        patterns: [],
        metadata: { options: request.options },
        always: request.options.filter((option) => option.kind === 'allow_always').map((option) => option.optionId),
      });
      this.wake(state);
    });
  }

  private wake(state: TurnState): void { for (const waiter of state.waiters.splice(0)) waiter(); }

  private cancelAllPermissions(): void {
    this.questions.cancel();
    for (const pending of this.permissions.values()) pending.resolve({ outcome: { outcome: 'cancelled' } });
    this.permissions.clear(); }

  private getMcpServers() {
    return validateDshMcpServers(this.options.getSettings().mcpServers ?? []);
  }

  private rememberConfiguration(sessionId: string, response: DshJsonObject, baseline = false): void {
    const options = response.configOptions ?? [];
    if (!Array.isArray(options) || options.some((value) => {
      const option = asRecord(value);
      return !option || typeof option.id !== 'string' || typeof option.currentValue !== 'string'
        || option.type !== 'select' || !Array.isArray(option.options);
    })) throw new Error('DSH returned invalid session configuration');
    this.configurations.set(sessionId, options as DshJsonObject[]);
    // Native image admission follows the selected model on every prompt. The
    // connection capability only controls whether an attachment UI is available.
    if (baseline) {
      const records = options as DshJsonObject[];
      const model = records.find((entry) => entry.id === 'model')?.currentValue;
      const effort = records.find((entry) => entry.id === 'reasoning_effort')?.currentValue;
      if (typeof model === 'string' && typeof effort === 'string') {
        const defaults = this.reasoningDefaults.get(sessionId) ?? new Map<string, string>();
        defaults.set(model, effort);
        this.reasoningDefaults.set(sessionId, defaults);
      }
    }
  }

  /** The catalog needs a native session. Reserve one draft and hand that same session to the next chat. */
  private async ensureConfigurationSession(sessionId?: string): Promise<string> {
    const client = await this.ready();
    if (sessionId) { await this.ensureSessionActive(client, sessionId); return sessionId; }
    if (this.catalogPromise) return this.catalogPromise;
    const generation = this.lifecycleGeneration;
    const cwd = this.resolveWorkingDirectory();
    const mcpServers = this.getMcpServers();
    const mcpKey = JSON.stringify(mcpServers);
    const existing = this.reservedSession;
    if (existing?.cwd === cwd && existing.mcpKey === mcpKey) return existing.id;
    const promise = (async () => {
      if (existing) {
        await client.closeSession(existing.id);
        this.assertCurrentClient(client, generation);
        this.sessions.delete(existing.id);
        this.configurations.delete(existing.id);
        this.reservedSession = null;
      }
      const response = await client.newSession(cwd, mcpServers);
      this.assertCurrentClient(client, generation);
      const id = typeof response.sessionId === 'string' ? response.sessionId.trim() : '';
      if (!id) throw new Error('DSH catalog session response has no session id');
      this.rememberConfiguration(id, response, true);
      this.sessions.add(id);
      this.reservedSession = { id, cwd, mcpKey };
      return id;
    })();
    this.catalogPromise = promise;
    try { return await promise; } finally { if (this.catalogPromise === promise) this.catalogPromise = null; }
  }

  async readSessionConfiguration(sessionId?: string): Promise<{
    sessionId: string; configOptions: DshJsonObject[]; images: boolean;
    controls: Array<{ id: string; name: string; value: string; choices: Array<{ value: string; name: string }> }>;
  }> {
    const id = await this.ensureConfigurationSession(sessionId);
    const configOptions = JSON.parse(JSON.stringify(this.configurations.get(id) ?? [])) as DshJsonObject[];
    return {
      sessionId: id, configOptions, images: this.hasCapability(AgentCapability.Images),
      controls: configOptions.map((option) => ({
        id: String(option.id), name: String(option.name ?? option.id), value: String(option.currentValue),
        choices: dshSelectChoices(option).map((choice) => ({ value: choice.value, name: `${choice.groupName}: ${choice.name}` })),
      })),
    };
  }

  async getModelSelectorProviders(sessionId?: string): Promise<DshModelSelectorProvider[]> {
    const { configOptions } = await this.readSessionConfiguration(sessionId);
    const model = configOptions.find((option) => option.id === 'model');
    const reasoning = configOptions.find((option) => option.id === 'reasoning_effort');
    const variants = dshSelectChoices(reasoning).map((choice) => choice.value);
    const providers = new Map<string, DshModelSelectorProvider>();
    for (const choice of dshSelectChoices(model)) {
      const provider = providers.get(choice.group) ?? { id: choice.group, name: choice.groupName, models: [] };
      provider.models.push({ id: choice.value, name: choice.name, variants: choice.value === model?.currentValue ? [...variants] : [] });
      providers.set(choice.group, provider);
    }
    return [...providers.values()];
  }

  getDefaultModelSelection(sessionId?: string): { provider: string; model: string } | null {
    const id = sessionId ?? this.reservedSession?.id;
    const option = id ? this.configurations.get(id)?.find((entry) => entry.id === 'model') : undefined;
    const choice = dshSelectChoices(option).find((entry) => entry.value === option?.currentValue);
    return choice ? { provider: choice.group, model: choice.value } : null;
  }

  getDefaultReasoningEffort(sessionId?: string): string | undefined {
    const id = sessionId ?? this.reservedSession?.id;
    const model = this.getDefaultModelSelection(id)?.model;
    return id && model ? this.reasoningDefaults.get(id)?.get(model) : undefined;
  }

  async getAvailableModels(options?: Record<string, unknown>): Promise<DshModelSelectorProvider[]> {
    return this.getModelSelectorProviders(typeof options?.sessionId === 'string' ? options.sessionId : undefined);
  }

  async getProviderDirectory(options?: Record<string, unknown>): Promise<DshModelSelectorProvider[]> {
    return this.getAvailableModels(options);
  }

  async getResolvedModelConfig(options?: Record<string, unknown>): Promise<unknown> {
    return this.readSessionConfiguration(typeof options?.sessionId === 'string' ? options.sessionId : undefined);
  }

  async setSessionConfigOption(sessionId: string | undefined, configId: string, value: string): Promise<void> {
    const id = await this.ensureConfigurationSession(sessionId);
    if (this.turns.has(id)) throw new Error('DSH configuration changes require an idle session');
    await this.applyConfigOption(await this.ready(), id, configId, value);
  }

  private async applyConfigOption(client: DshClientPort, sessionId: string, configId: string, value: string): Promise<void> {
    const option = this.configurations.get(sessionId)?.find((entry) => entry.id === configId);
    if (!option || !dshSelectChoices(option).some((choice) => choice.value === value))
      throw new Error('DSH configuration value is not in the native session catalog');
    if (option.currentValue === value) return;
    const generation = this.lifecycleGeneration;
    const response = await client.setConfigOption(sessionId, configId, value);
    this.assertCurrentClient(client, generation);
    this.rememberConfiguration(sessionId, response, configId === 'model');
    if (this.configurations.get(sessionId)?.find((entry) => entry.id === configId)?.currentValue !== value)
      throw new Error('DSH did not confirm the requested session configuration');
  }

  private async applySendConfiguration(client: DshClientPort, sessionId: string, options: Record<string, unknown>): Promise<void> {
    const model = options.model;
    if (model !== undefined && model !== '') {
      if (typeof model !== 'string') throw new Error('Invalid DSH model selection');
      const option = this.configurations.get(sessionId)?.find((entry) => entry.id === 'model');
      const choice = dshSelectChoices(option).find((entry) => entry.value === model);
      if (!choice || (options.provider && choice.group !== options.provider)) throw new Error('DSH model is not in the native session catalog');
      await this.applyConfigOption(client, sessionId, 'model', model);
    }
    const effort = options.variant === undefined || options.variant === '' ? this.getDefaultReasoningEffort(sessionId) : options.variant;
    if (effort !== undefined && effort !== '') {
      if (typeof effort !== 'string') throw new Error('Invalid DSH reasoning effort');
      await this.applyConfigOption(client, sessionId, 'reasoning_effort', effort);
    }
  }

  private acceptContextUsage(sessionId: string, update: DshJsonObject): ContextUsageSnapshot | null {
    if (typeof update.used !== 'number' || !Number.isSafeInteger(update.used) || update.used < 0
      || typeof update.size !== 'number' || !Number.isSafeInteger(update.size) || update.size <= 0) return null;
    const previous = this.contextUsage.get(sessionId);
    const model = this.turns.get(sessionId)?.selection ?? null;
    const now = Date.now();
    // The native meter only reports a breakdown once a real turn anchored the
    // measurement on the model's reported usage; until then totals stay opaque.
    const breakdownAvailable = typeof update.inputTokens === 'number' && typeof update.outputTokens === 'number';
    const inputTokens = breakdownAvailable ? update.inputTokens as number : 0;
    const outputTokens = breakdownAvailable ? update.outputTokens as number : 0;
    const cacheReadTokens = typeof update.cacheReadTokens === 'number' ? update.cacheReadTokens as number : 0;
    const cacheWriteTokens = typeof update.cacheWriteTokens === 'number' ? update.cacheWriteTokens as number : null;
    const snapshot: ContextUsageSnapshot = {
      sessionId, sessionTitle: '', createdAt: previous?.createdAt ?? now, updatedAt: now,
      // The harness config group (e.g. deepseek-official) is a display label,
      // not a pricing-catalog provider; pricing resolves from the real model
      // id decoded out of the opaque selection.
      providerId: null, providerName: model?.provider ?? null,
      modelId: decodeDshOpaqueModel(model?.model) ?? model?.model ?? null,
      modelName: null,
      contextWindow: update.size, totalTokens: update.used,
      inputTokens, outputTokens, reasoningTokens: 0, cacheReadTokens, cacheWriteTokens,
      totalCost: null, tokenBreakdownAvailable: breakdownAvailable,
    };
    this.contextUsage.set(sessionId, snapshot);
    return snapshot;
  }

  async getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null> {
    const snapshot = this.contextUsage.get(sessionId);
    return snapshot ? { ...snapshot } : null;
  }
}

function dshSelectChoices(option: DshJsonObject | undefined): Array<{ value: string; name: string; group: string; groupName: string }> {
  const choices: Array<{ value: string; name: string; group: string; groupName: string }> = [];
  for (const value of Array.isArray(option?.options) ? option.options : []) {
    const entry = asRecord(value);
    if (!entry) continue;
    const group = typeof entry.group === 'string' ? entry.group : 'dsh';
    const groupName = typeof entry.name === 'string' ? entry.name : group;
    for (const item of Array.isArray(entry.options) ? entry.options : [entry]) {
      const choice = asRecord(item);
      if (typeof choice?.value === 'string' && typeof choice.name === 'string')
        choices.push({ value: choice.value, name: choice.name, group, groupName });
    }
  }
  return choices;
}

function isTransportUncertainPromptError(error: Error): boolean {
  // A provider's known RPC failure may mention "protocol" or "transport" without losing the ACP connection.
  return /^DSH ACP (?:session\/(?:prompt|set_config_option) timed out|process (?:exited|stopped)|client stopped)/i.test(error.message);
}

function translateDshUpdate(update: DshJsonObject): StreamChunk | null {
  const type = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
  if (type === 'agent_message_chunk' || type === 'agent_thought_chunk') {
    const content = asRecord(update.content);
    const text = dshContentBlockText(content);
    if (!text) return null;
    return type === 'agent_thought_chunk'
      ? { type: 'thinking', content: text, ...(typeof update.messageId === 'string' ? { partId: update.messageId } : {}) }
      : { type: 'text', content: text };
  }
  if (type === 'tool_call') {
    return {
      type: 'tool_use',
      id: String(update.toolCallId ?? ''),
      name: String(update.title ?? update.name ?? 'tool'),
      input: asRecord(update.rawInput) ?? (typeof update.rawInput === 'string' ? { rawInput: update.rawInput } : {}),
    };
  }
  if (type === 'tool_call_update') {
    if (update.status !== 'completed' && update.status !== 'failed') return null;
    return {
      type: 'tool_result',
      toolUseId: String(update.toolCallId ?? ''),
      content: Array.isArray(update.content)
        ? update.content.map((value) => {
          const item = asRecord(value);
          return dshContentBlockText(asRecord(item?.content) ?? item);
        }).filter(Boolean).join('\n') || contentText(update.content)
        : contentText(update.content),
      isError: update.status === 'failed',
    };
  }
  return null;
}

function asRecord(value: unknown): DshJsonObject | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as DshJsonObject : null; }

/** Catalog timestamps arrive as ISO strings; numeric inputs pass through. */
function toEpochMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/** Native model selections are opaque JSON arrays ["provider","model-id"]. */
function decodeDshOpaqueModel(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[1] === 'string' && parsed[1] ? parsed[1] : null;
  } catch {
    return null;
  }
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((entry) => {
    const content = asRecord(entry);
    const nested = asRecord(content?.content);
    if (content?.type === 'image' || nested?.type === 'image') return '[DeepSeek Harness tool returned image content that this adapter cannot render]';
    return typeof nested?.text === 'string' ? nested.text : typeof content?.text === 'string' ? content.text : '';
  }).filter(Boolean).join('\n');
}

async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([promise.then(() => true),
    new Promise<false>((resolve) => { timeout = setTimeout(() => resolve(false), timeoutMs); })]);
  if (timeout) clearTimeout(timeout);
  return result;
}
