/* eslint-disable max-lines -- DSH session lifecycle, ACP mapping, and fail-closed recovery stay in one adapter boundary. */
import { appendObsidianContextBlocks } from '../../../shared/obsidianContext';
import { backendSessionCatalogFailure, BackendSessionCatalogReadError } from '../../../shared/sessionCatalogReadback';
import { prependMemoryInjection } from '../../memory';
import { prependObsidianToolingInjection } from '../../obsidianTooling';
import type { StreamChunk } from '../../types/chat';
import type { DshBackendSettings } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentPermissionCapability,
  AgentService,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import {
  DshAcpClient,
  type DshAcpClientOptions,
  type DshAcpPermissionRequest,
  type DshAcpPermissionResponse,
  type DshAcpUpdate,
  type DshJsonObject,
  resolveDshLaunch,
} from './dsh/DshAcpClient';

const CAPABILITIES: BackendCapabilities = Object.freeze(new Set([
  AgentCapability.Chat,
  AgentCapability.Sessions,
  AgentCapability.Permissions,
  AgentCapability.Thinking,
]));

interface TurnState {
  readonly sessionId: string; readonly generation: number;
  readonly chunks: StreamChunk[]; readonly waiters: Array<() => void>;
  readonly nativeSettled: Promise<void>; readonly settleNative: () => void;
  done: boolean; cancelled: boolean; promptStarted: boolean; requiresRecovery: boolean; error: Error | null;
}

interface PendingPermission {
  readonly id: string; readonly sessionId: string;
  readonly options: DshAcpPermissionRequest['options'];
  readonly resolve: (response: DshAcpPermissionResponse) => void;
}

type DshClientPort = Pick<DshAcpClient,
  'isStarted' | 'start' | 'stop' | 'newSession' | 'listSessions' | 'resumeSession' | 'prompt' | 'cancel'>;

export interface DshAdapterOptions {
  readonly workingDirectory: string;
  readonly getSettings: () => DshBackendSettings;
  readonly getExtraEnv?: () => Readonly<Record<string, string>>;
  readonly createClient?: (options: DshAcpClientOptions) => DshClientPort;
  readonly cancelTimeoutMs?: number;
}

/** First-class DeepSeek Harness backend over the documented ACP stdio profile. */
export class DshAdapter implements AgentService, AgentChatCapability, AgentSessionCapability, AgentPermissionCapability {
  readonly kind = 'dsh' as const;
  readonly displayName = 'DeepSeek Harness';
  readonly description = 'DeepSeek Harness CLI via ACP';
  readonly capabilities = CAPABILITIES;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>(); private readonly sessions = new Set<string>();
  private readonly turns = new Map<string, TurnState>(); private readonly permissions = new Map<string, PendingPermission>();
  private readonly turnGenerations = new Map<string, number>(); private readonly resumePromises = new Map<string, Promise<void>>();
  private readonly cancellationPromises = new Map<string, Promise<void>>(); private client: DshClientPort | null = null;
  private startingClient: DshClientPort | null = null; private starting: Promise<void> | null = null;
  private connectionKey: string | null = null;
  private lifecycleGeneration = 0;
  private nextPermissionId = 1;

  constructor(private readonly options: DshAdapterOptions) {}

  get status(): AgentConnectionStatus { return this.statusValue; } hasCapability(cap: AgentCapability): boolean { return this.capabilities.has(cap); }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return { dispose: () => this.statusHandlers.delete(handler) }; }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    const settings = this.options.getSettings();
    const workingDirectory = settings.workingDirectory || this.options.workingDirectory;
    const launch = resolveDshLaunch(settings, this.options.getExtraEnv?.() ?? {});
    const connectionKey = JSON.stringify([workingDirectory, launch.command, launch.args, Object.entries(launch.env).sort(([left], [right]) => left.localeCompare(right))]);
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
    const factory = this.options.createClient ?? ((clientOptions: DshAcpClientOptions) => new DshAcpClient(clientOptions));
    const client = factory({
      cwd: workingDirectory,
      launch,
      onUpdate: (update) => { if (this.client === client) this.handleUpdate(update); },
      onPermissionRequest: (request) => this.client === client
        ? this.handlePermissionRequest(request)
        : Promise.resolve({ outcome: { outcome: 'cancelled' } }),
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
    this.sessions.clear();
    this.resumePromises.clear();
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
    void this.stop().catch(() => undefined);
    this.statusHandlers.clear(); }

  async createSession(_title?: string, options?: Record<string, unknown>): Promise<string> {
    const client = await this.ready();
    const generation = this.lifecycleGeneration;
    const workingDirectory = this.resolveWorkingDirectory(options);
    const resumeSessionId = typeof options?.resumeSessionId === 'string' ? options.resumeSessionId.trim() : '';
    if (resumeSessionId) {
      await client.resumeSession(resumeSessionId, workingDirectory);
      this.assertCurrentClient(client, generation);
      this.sessions.add(resumeSessionId);
      return resumeSessionId;
    }
    const response = await client.newSession(workingDirectory);
    this.assertCurrentClient(client, generation);
    const sessionId = typeof response.sessionId === 'string' ? response.sessionId.trim() : '';
    if (!sessionId) throw new Error('DSH ACP session response did not include a session id');
    this.sessions.add(sessionId);
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
        if (!record || !sessionId) fail('Invalid session catalog identity');
        if (!rows.has(sessionId)) rows.set(sessionId, { ...record, id: sessionId });
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

  async updateSessionTitle(_sessionId: string, _title: string): Promise<void> {
    throw new Error('DSH ACP does not expose session title mutation');
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    rejectUnsupportedSendOptions(request);
    const client = await this.ready();
    await this.cancellationPromises.get(request.sessionId);
    if (this.turns.has(request.sessionId)) throw new Error('DSH ACP allows only one prompt per session');
    const generation = (this.turnGenerations.get(request.sessionId) ?? 0) + 1;
    this.turnGenerations.set(request.sessionId, generation);
    let settleNative!: () => void;
    const nativeSettled = new Promise<void>((resolve) => { settleNative = resolve; });
    const state: TurnState = {
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
      await this.ensureSessionActive(client, request.sessionId);
      if (state.cancelled) {
        state.settleNative();
        yield { type: 'message_stop' };
        return;
      }
      yield { type: 'message_start' };
      state.promptStarted = true;
      void client.prompt(request.sessionId, buildDshPromptContent(request))
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
      if (!state.cancelled) yield { type: 'error', content: error instanceof Error ? error.message : String(error) };
      yield { type: 'message_stop' };
    } finally {
      if (state.requiresRecovery) {
        this.client?.cancel(request.sessionId);
        await this.recoverFromStuckCancellation();
        state.cancelled = true;
      } else if (state.promptStarted && !state.done && !state.cancelled) await this.cancelStream(request.sessionId);
      if (!state.promptStarted) state.settleNative();
      if (this.turns.get(request.sessionId) === state) this.turns.delete(request.sessionId);
    }
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
    this.sessions.clear();
    this.resumePromises.clear();
    this.cancelAllPermissions();
    this.setStatus('error');
    await client.stop();
  }

  async getPendingPermissions(): Promise<unknown[]> {
    return [...this.permissions.values()].map((permission) => ({
      id: permission.id,
      sessionID: permission.sessionId,
      permission: String(permission.options[0]?.name ?? 'tool'),
      patterns: permission.options.map((option) => option.name ?? option.optionId),
    }));
  }

  async respondToPermission(requestID: string, reply: unknown): Promise<void> {
    if (reply !== 'once' && reply !== 'always' && reply !== 'reject') {
      throw new Error('Invalid DSH permission reply');
    }
    const pending = this.permissions.get(requestID);
    if (!pending) throw new Error('DSH permission request is no longer active');
    const kinds = reply === 'once' ? ['allow_once']
      : reply === 'always' ? ['allow_always']
        : ['reject_once', 'reject_always'];
    const selected = pending.options.find((option) => kinds.includes(option.kind ?? ''));
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
    const resume = client.resumeSession(sessionId, this.resolveWorkingDirectory())
      .then(() => {
        if (this.client !== client || this.lifecycleGeneration !== generation) {
          throw new Error('DeepSeek Harness session resume was superseded');
        }
        this.sessions.add(sessionId);
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
    this.sessions.clear();
    this.resumePromises.clear();
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
    const state = this.turns.get(update.sessionId);
    if (!state || state.cancelled || state.generation !== this.turnGenerations.get(update.sessionId)) return;
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
    return new Promise<DshAcpPermissionResponse>((resolve) => {
      this.permissions.set(id, { id, sessionId: request.sessionId, options: request.options, resolve });
      state.chunks.push({
        type: 'permission_request',
        id,
        sessionID: request.sessionId,
        permission: String(request.toolCall.title ?? request.toolCall.name ?? 'tool'),
        patterns: request.options.map((option) => option.name ?? option.optionId),
        metadata: { options: request.options },
        always: request.options.filter((option) => option.kind === 'allow_always').map((option) => option.optionId),
      });
      this.wake(state);
    });
  }

  private wake(state: TurnState): void { for (const waiter of state.waiters.splice(0)) waiter(); }

  private cancelAllPermissions(): void {
    for (const pending of this.permissions.values()) pending.resolve({ outcome: { outcome: 'cancelled' } });
    this.permissions.clear(); }
}

function rejectUnsupportedSendOptions(request: AgentChatSendRequest): void {
  if (request.images?.length) throw new Error('DeepSeek Harness image prompts are not supported by this adapter');
  const options = request.options ?? {};
  if (['provider', 'model', 'variant'].some((key) => options[key] !== undefined && options[key] !== ''))
    throw new Error('DeepSeek Harness per-turn model overrides are not supported by this adapter');
}

function isTransportUncertainPromptError(error: Error): boolean {
  return /session\/prompt timed out|process (?:exited|stopped)|client stopped|protocol|transport/i.test(error.message);
}

function translateDshUpdate(update: DshJsonObject): StreamChunk | null {
  const type = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
  if (type === 'agent_message_chunk' || type === 'agent_thought_chunk') {
    const content = asRecord(update.content);
    const text = typeof content?.text === 'string' ? content.text : '';
    if (!text && content?.type === 'image') {
      return { type: 'text', content: '[DeepSeek Harness returned image content that this adapter cannot render]' };
    }
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
      content: contentText(update.content),
      isError: update.status === 'failed',
    };
  }
  return null;
}

function buildDshPromptContent(request: AgentChatSendRequest): string {
  const parts = Array.isArray(request.options?.requestParts) ? request.options.requestParts : [];
  const textParts: string[] = [];
  const fileParts: string[] = [];
  for (const value of parts) {
    const part = asRecord(value);
    if (part?.type === 'text' && typeof part.text === 'string' && part.text) textParts.push(part.text);
    if (part?.type !== 'file') continue;
    const source = asRecord(part.source);
    const selection = asRecord(source?.text);
    const url = typeof part.url === 'string' ? part.url : '';
    let content = typeof selection?.value === 'string' ? selection.value : '';
    if (!content && url.startsWith('data:text/')) {
      const comma = url.indexOf(',');
      if (comma >= 0) {
        const encoded = url.slice(comma + 1);
        content = url.slice(0, comma).endsWith(';base64')
          ? Buffer.from(encoded, 'base64').toString('utf8')
          : decodeURIComponent(encoded);
      }
    }
    const label = String(source?.path ?? part.filename ?? 'file');
    fileParts.push(`[Attached file: ${label}]\n${content || (url.startsWith('file:') ? url : '')}`);
  }
  const base = [textParts.join('\n') || request.content, ...fileParts].filter(Boolean).join('\n\n');
  return appendObsidianContextBlocks(
    prependObsidianToolingInjection(prependMemoryInjection(base, request.options), request.options),
    request.options,
  );
}

function asRecord(value: unknown): DshJsonObject | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as DshJsonObject : null; }

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
