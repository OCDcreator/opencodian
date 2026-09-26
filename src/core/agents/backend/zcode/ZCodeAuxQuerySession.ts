/* eslint-disable max-params, complexity -- the session constructor and native event loop are one audited lifecycle boundary. */

/**
 * ZCodeAuxQuerySession — a private, fail-closed auxiliary session.
 *
 * The regular ZCode adapter owns the user's app-server and its persistent
 * session store.  Reusing either for inline work would leave a native session
 * in the user's history (and the native `session/close` operation is only a
 * handle close).  This module therefore owns a second app-server process and
 * a private `ZCODE_STORAGE_DIR` for its whole lifetime.
 *
 * Read-only is proved by the runtime, not by the prompt: the create/send
 * requests use an empty native tool allowlist, then the first persisted user
 * message is read back and its `info.tools` object must be empty.  Every turn
 * also audits native tool events and the turn tool count.  A missing or
 * widening readback tears down the session immediately.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  AuxObservedToolCall,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQuerySessionConfig,
  AuxQueryTurnRequest,
} from '../AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../AgentAuxQueryCapability';
import { ZCodeAppServerTransport } from './ZCodeAppServerTransport';
import { toZCodeImageInput } from './ZCodeImageAttachment';
import {
  parseZCodeCatalogSnapshot,
  validateZCodeModelSelection,
} from './ZCodeModelCatalog';
import type { ZCodeRuntimeLaunch } from './ZCodeRuntimeResolver';

const SCOPE_PREFIX = 'opencodian-zcode-aux-';
const OWNER_MARKER = '.opencodian-zcode-aux-owner.json';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_TURN_TIMEOUT_MS = 180_000;
const READBACK_TIMEOUT_MS = 4_000;
const READBACK_POLL_MS = 40;
const EXIT_TIMEOUT_MS = 2_500;

/** A transport slice shared by the real transport and focused fakes. */
export interface ZCodeAuxTransport {
  start(): Promise<void>;
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  onNotification(method: string, handler: (params: Record<string, unknown>) => void): { dispose(): void };
  dispose(): void;
}

export interface ZCodeAuxQuerySessionOptions {
  readonly launch: ZCodeRuntimeLaunch;
  readonly providerConfigEnv?: Readonly<Record<string, string>>;
  readonly workingDirectory: string;
  readonly systemPrompt: string;
  readonly model?: AuxQuerySessionConfig['model'];
  readonly turnTimeoutMs?: number;
  /** Test-only parent; production always uses the OS temp directory. */
  readonly tempParent?: string;
  readonly createTransport?: (options: ConstructorParameters<typeof ZCodeAppServerTransport>[0]) => ZCodeAuxTransport;
}

interface OwnedScope {
  readonly root: string;
  readonly storage: string;
  readonly token: string;
  readonly parent: string;
}

interface NativeEvent {
  readonly type: string;
  readonly sessionId: string;
  readonly turnId?: string;
  readonly payload: Record<string, unknown>;
}

interface ToolReadback {
  readonly tools: readonly string[];
  readonly observed: boolean;
}

type NativeMessageIdentity = string;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Native protocol versions have used both names; neither may be synthesized. */
function messageIdentity(info: Record<string, unknown>): NativeMessageIdentity | null {
  const id = asString(info['id']) || asString(info['messageId']);
  return id || null;
}

function createOwnedScope(tempParent?: string): OwnedScope {
  const parent = fs.realpathSync(tempParent ?? os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, SCOPE_PREFIX));
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(path.join(root, OWNER_MARKER), JSON.stringify({ token, prefix: SCOPE_PREFIX }), { encoding: 'utf8', mode: 0o600 });
  const storage = path.join(root, 'storage');
  fs.mkdirSync(storage, { recursive: true, mode: 0o700 });
  return { root, storage, token, parent };
}

/**
 * Remove only a scope created by `createOwnedScope`.  The marker, canonical
 * parent, direct-child relationship, and reserved prefix are all checked
 * before the recursive operation.  Callers must only invoke this after the
 * child process has exited; an unconfirmed process deliberately leaves the
 * private scope for later inspection instead of racing a live writer.
 */
export function removeOwnedZCodeAuxScope(scope: OwnedScope): boolean {
  let realRoot: string;
  let realParent: string;
  try {
    realRoot = fs.realpathSync(scope.root);
    realParent = fs.realpathSync(scope.parent);
    const marker = JSON.parse(fs.readFileSync(path.join(realRoot, OWNER_MARKER), 'utf8')) as Record<string, unknown>;
    if (marker['token'] !== scope.token || marker['prefix'] !== SCOPE_PREFIX) return false;
  } catch {
    return false;
  }
  if (path.dirname(realRoot) !== realParent || !path.basename(realRoot).startsWith(SCOPE_PREFIX)) return false;
  try {
    fs.rmSync(realRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 30 });
    return !fs.existsSync(realRoot);
  } catch {
    return false;
  }
}

function nativeEvent(value: unknown): NativeEvent | null {
  const root = asRecord(value);
  const type = asString(root['type']);
  const sessionId = asString(root['sessionId']);
  if (!type || !sessionId) return null;
  return {
    type,
    sessionId,
    ...(asString(root['turnId']) ? { turnId: asString(root['turnId']) } : {}),
    payload: asRecord(root['payload']),
  };
}

function readToolNames(value: unknown): readonly string[] | null {
  const tools = asRecord(value);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const names = Object.entries(tools).filter(([, enabled]) => enabled === true).map(([name]) => name);
  // A false/unknown entry is not a proof of absence.  Fail closed on it.
  if (Object.entries(tools).some(([, enabled]) => enabled !== true)) return null;
  return names;
}

function redactFailure(): string {
  return 'ZCode auxiliary turn failed; runtime details withheld to protect session data.';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export class ZCodeAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  readonly supportsImages = true;
  readonly safety: AuxQuerySafetyProof;

  private readonly scope: OwnedScope;
  private readonly transport: ZCodeAuxTransport;
  private readonly sessionId: string;
  private readonly turnTimeoutMs: number;
  private readonly events: NativeEvent[] = [];
  private readonly eventWaiters = new Set<() => void>();
  private readonly subscriptions: Array<{ dispose(): void }> = [];
  private activeAbort: AbortController | null = null;
  private inFlight: Promise<AuxQueryResult> | null = null;
  private disposed = false;
  private exitConfirmed = false;
  private readbackVerified = false;
  private supportsImagesForModel: boolean | null = null;

  private constructor(
    private readonly options: ZCodeAuxQuerySessionOptions,
    scope: OwnedScope,
    transport: ZCodeAuxTransport,
    sessionId: string,
    initialTools: readonly string[],
  ) {
    this.queryId = `zcode-aux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.scope = scope;
    this.transport = transport;
    this.sessionId = sessionId;
    this.turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
    this.safety = {
      backend: 'zcode',
      enforcedPolicy: 'none',
      effectiveTools: initialTools,
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'isolated ZCode app-server with empty toolAllowlist, no MCP/dynamic workflow, and native session/messages info.tools readback',
    };
  }

  /** Create and handshake an isolated native session. */
  static async create(options: ZCodeAuxQuerySessionOptions): Promise<ZCodeAuxQuerySession> {
    const workingDirectory = options.workingDirectory.trim();
    if (!workingDirectory) throw new Error('ZCode auxiliary session requires a workspace path.');
    const scope = createOwnedScope(options.tempParent);
    let transport: ZCodeAuxTransport | null = null;
    let exitResolve: (() => void) | null = null;
    let exitConfirmed = false;
    let instance: ZCodeAuxQuerySession | null = null;
    const exitPromise = new Promise<void>((resolve) => { exitResolve = resolve; });
    try {
      const createTransport = options.createTransport ?? ((transportOptions) => new ZCodeAppServerTransport(transportOptions));
      transport = createTransport({
        launch: options.launch,
        workingDirectory,
        requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
        extraEnv: {
          ...(options.providerConfigEnv ?? {}),
          ZCODE_STORAGE_DIR: scope.storage,
        },
        onExit: () => {
          exitConfirmed = true;
          if (instance) instance.exitConfirmed = true;
          thisMarkExit(exitResolve);
        },
      });
      await transport.start();
      await transport.request('runtime/capabilities', {});
      const created = asRecord(await transport.request('session/create', {
        workspace: { workspaceKey: workingDirectory, workspacePath: workingDirectory },
        persistence: 'deferred',
        titleGenerationEnabled: false,
        mcpServers: [],
        toolAllowlist: [],
        toolDenylist: ['Bash', 'Write', 'Edit', 'Agent', 'Task', 'CronCreate', 'CronDelete', 'CronList', 'CronUpdate', 'SendMessage', 'Skill', 'TodoWrite', 'Glob', 'Grep', 'Mcp', 'Shell', 'Exec', 'Terminal'],
        dynamicWorkflowEnabled: false,
        offPeakToolEnabled: false,
      }));
      const session = asRecord(created['session']);
      const sessionId = asString(session['sessionId']);
      if (!sessionId) throw new Error('ZCode auxiliary session did not return a native session id.');
      const sessionInstance = new ZCodeAuxQuerySession(options, scope, transport, sessionId, []);
      instance = sessionInstance;
      sessionInstance.subscriptions.push(transport.onNotification('session/event', (params) => {
        const event = nativeEvent(params);
        if (!event || event.sessionId !== sessionInstance.sessionId) return;
        sessionInstance.events.push(event);
        for (const wake of sessionInstance.eventWaiters) wake();
      }));
      await sessionInstance.applyModel(created);
      await transport.request('session/subscribe', { sessionId, deliveryKind: 'desktop-continuous' });
      return sessionInstance;
    } catch (error) {
      transport?.dispose();
      await Promise.race([exitPromise, wait(EXIT_TIMEOUT_MS)]);
      // The runtime writes a SQLite/artifact store below the scope.  Its
      // process must be definitely gone before any recursive removal; a
      // timeout intentionally retains only this marker-owned private root.
      if (exitConfirmed) removeOwnedZCodeAuxScope(scope);
      throw error instanceof Error ? error : new Error(String(error));
    }
    function thisMarkExit(resolve: (() => void) | null): void {
      if (resolve) resolve();
    }
  }

  async query(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runTurn(request, true);
  }

  async followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runTurn({ ...request, prompt }, false);
  }

  cancel(): void {
    this.activeAbort?.abort();
    void this.transport.request('session/stop', { sessionId: this.sessionId }).catch(() => { /* best effort */ });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.activeAbort?.abort();
    for (const subscription of this.subscriptions.splice(0)) subscription.dispose();
    this.transport.dispose();
    // The real transport resolves this through its onExit callback.  Never
    // remove a scope while the child may still have an open SQLite/artifact
    // handle; an unconfirmed exit leaves the private root for inspection.
    if (!this.exitConfirmed) await wait(EXIT_TIMEOUT_MS);
    if (this.exitConfirmed) removeOwnedZCodeAuxScope(this.scope);
  }

  private async applyModel(created: Record<string, unknown>): Promise<void> {
    const selected = this.options.model;
    const initialCatalog = parseZCodeCatalogSnapshot(asRecord(created['settings']));
    if (initialCatalog?.currentModel) {
      const current = initialCatalog.models.find((entry) => entry.providerId === initialCatalog.currentModel?.providerId
        && entry.modelId === initialCatalog.currentModel?.modelId);
      this.supportsImagesForModel = current?.supportsImageInput ?? null;
    }
    if (!selected) return;
    if (selected.kind !== 'zcode') throw new Error('ZCode auxiliary session requires a ZCode model selection.');
    const settings = asRecord(created['settings']);
    const catalog = parseZCodeCatalogSnapshot(settings);
    if (!catalog) throw new Error('ZCode auxiliary model catalog was unavailable.');
    const validation = validateZCodeModelSelection(catalog, {
      providerId: selected.provider,
      modelId: selected.model,
      reasoningLevel: selected.reasoningLevel,
    });
    if (!validation.ok) throw new Error(validation.detail);
    await this.transport.request('session/setModel', {
      sessionId: this.sessionId,
      model: {
        providerId: selected.provider,
        modelId: selected.model,
        ...(validation.reasoningLevel ? { options: { reasoningLevel: validation.reasoningLevel } } : {}),
      },
    });
    const read = asRecord(await this.transport.request('session/read', { sessionId: this.sessionId }));
    const readCatalog = parseZCodeCatalogSnapshot(asRecord(read['settings']));
    if (readCatalog?.currentModel) {
      const current = readCatalog.models.find((entry) => entry.providerId === readCatalog.currentModel?.providerId
        && entry.modelId === readCatalog.currentModel?.modelId);
      this.supportsImagesForModel = current?.supportsImageInput ?? null;
    }
    const current = asRecord(asRecord(asRecord(read['settings'])['model'])['current']);
    const options = asRecord(current['options']);
    if (current['providerId'] !== selected.provider || current['modelId'] !== selected.model
      || (validation.reasoningLevel && options['reasoningLevel'] !== validation.reasoningLevel)) {
      throw new Error('ZCode auxiliary model readback did not confirm the requested selection.');
    }
  }

  private async runTurn(request: AuxQueryTurnRequest, includeSystemPrompt: boolean): Promise<AuxQueryResult> {
    if (this.disposed) return { success: false, error: 'ZCode auxiliary session is closed.', cancelled: true };
    if (this.inFlight) return { success: false, error: 'ZCode auxiliary session is already running a turn.' };
    const run = this.executeTurn(request, includeSystemPrompt);
    this.inFlight = run;
    try { return await run; } finally { if (this.inFlight === run) this.inFlight = null; }
  }

  private async executeTurn(request: AuxQueryTurnRequest, includeSystemPrompt: boolean): Promise<AuxQueryResult> {
    const abort = new AbortController();
    this.activeAbort = abort;
    const observed: AuxObservedToolCall[] = [];
    let sawToolEvent = false;
    let streamed = '';
    this.events.length = 0;
    request.signal?.addEventListener('abort', () => abort.abort(), { once: true });
    const timeout = setTimeout(() => abort.abort(), this.turnTimeoutMs);
    try {
      const images = request.images ?? [];
      if (images.length > 0 && this.supportsImagesForModel !== true) {
        return { success: false, error: 'The selected ZCode model does not report image input support; the turn was not sent.' };
      }
      const content = includeSystemPrompt && this.options.systemPrompt.trim()
        ? `${this.options.systemPrompt}\n\n---\n\n${request.prompt}` : request.prompt;
      const priorUserMessageIds = await this.readUserMessageIds();
      await this.transport.request('session/send', {
        sessionId: this.sessionId,
        content,
          ...(images.length ? { attachments: images.map((image, index) => toZCodeImageInput({
            data: image.data,
            mediaType: image.mediaType,
          }, index)) } : {}),
      });
      const readback = await this.waitForEffectiveTools(abort.signal, priorUserMessageIds);
      if (!readback || readback.tools.length !== 0) {
        const wasCancelled = abort.signal.aborted;
        await this.stopAndDispose();
        if (wasCancelled) {
          return { success: false, error: 'ZCode auxiliary turn was cancelled.', cancelled: true };
        }
        return { success: false, error: 'ZCode auxiliary session could not prove an empty native tool set.' };
      }
      this.readbackVerified = true;
      (this.safety as { effectiveTools: readonly string[] }).effectiveTools = readback.tools;
      for (;;) {
        const event = await this.nextEvent(abort.signal);
        if (event.type === 'model.streaming') {
          const kind = asString(event.payload['kind']);
          // Tool-call deltas have occurred in version-adjacent runtime builds.
          // A new or untyped delta cannot establish a read-only turn either.
          if (kind !== 'text_delta' && kind !== 'thinking_delta') {
            await this.stopAndDispose();
            return { success: false, error: 'ZCode auxiliary turn emitted an unverified streaming event; the read-only contract was not met.' };
          }
          const delta = asRecord(event.payload['delta']);
          const text = kind === 'text_delta' ? asString(event.payload['delta']) : asString(delta['text']);
          if (text) { streamed += text; request.onTextChunk?.(streamed); }
          continue;
        }
        if (event.type === 'tool.updated' || event.type === 'tool.scheduled' || event.type === 'tool.started') {
          sawToolEvent = true;
          const name = asString(event.payload['toolName']);
          if (name && !observed.some((entry) => entry.name === name)) observed.push({ name });
          continue;
        }
        if (event.type === 'turn.cancelled') return { success: false, error: 'ZCode auxiliary turn was cancelled.', cancelled: true };
        if (event.type === 'turn.failed') { await this.stopAndDispose(); return { success: false, error: redactFailure() }; }
        if (event.type !== 'turn.completed') continue;
        const count = event.payload['toolCallCount'];
        if (sawToolEvent || observed.length > 0 || typeof count !== 'number' || !Number.isInteger(count) || count !== 0) {
          await this.stopAndDispose();
          return { success: false, error: 'ZCode auxiliary turn observed a native tool call; the read-only contract was not met.' };
        }
        const text = asString(event.payload['response']) || streamed;
        if (!text) return { success: false, error: 'ZCode auxiliary turn returned an empty response.' };
        return { success: true, text, toolCalls: observed };
      }
    } catch {
      if (abort.signal.aborted) {
        await this.stopAndDispose();
        return { success: false, error: 'ZCode auxiliary turn was cancelled.', cancelled: true };
      }
      await this.stopAndDispose();
      return { success: false, error: redactFailure() };
    } finally {
      clearTimeout(timeout);
      if (this.activeAbort === abort) this.activeAbort = null;
    }
  }

  private async readUserMessageIds(): Promise<ReadonlySet<NativeMessageIdentity>> {
    const result = asRecord(await this.transport.request('session/messages', { sessionId: this.sessionId, limit: 100 }));
    const messages = Array.isArray(result['messages']) ? result['messages'] : [];
    const ids = new Set<NativeMessageIdentity>();
    for (const message of messages.map(asRecord)) {
      const info = asRecord(message['info']);
      if (info['role'] !== 'user') continue;
      const id = messageIdentity(info);
      if (!id) throw new Error('ZCode auxiliary session message readback has no stable user-message identity.');
      ids.add(id);
    }
    return ids;
  }

  private async waitForEffectiveTools(
    signal: AbortSignal,
    priorUserMessageIds: ReadonlySet<NativeMessageIdentity>,
  ): Promise<ToolReadback | null> {
    const deadline = Date.now() + READBACK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (signal.aborted) return null;
      const result = asRecord(await this.transport.request('session/messages', { sessionId: this.sessionId, limit: 50 }));
      const messages = Array.isArray(result['messages']) ? result['messages'] : [];
      const newUsers = messages
        .map(asRecord)
        .filter((message) => {
          const info = asRecord(message['info']);
          const id = messageIdentity(info);
          return info['role'] === 'user' && id !== null && !priorUserMessageIds.has(id);
        });
      // A stable current-turn identity prevents a follow-up from accepting the
      // previous turn's empty tool readback while the new message persists.
      if (newUsers.length > 1) return null;
      const user = newUsers[0];
      const info = asRecord(user?.['info']);
      if (user && Object.prototype.hasOwnProperty.call(info, 'tools')) {
        const tools = readToolNames(info['tools']);
        return tools ? { tools, observed: true } : null;
      }
      await wait(READBACK_POLL_MS);
    }
    return null;
  }

  private nextEvent(signal: AbortSignal): Promise<NativeEvent> {
    if (signal.aborted) return Promise.reject(new Error('cancelled'));
    const queued = this.events.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const wake = (): void => {
        cleanup();
        const event = this.events.shift();
        if (event) resolve(event); else reject(new Error('ZCode auxiliary event queue closed.'));
      };
      const abort = (): void => { cleanup(); reject(new Error('cancelled')); };
      const cleanup = (): void => { this.eventWaiters.delete(wake); signal.removeEventListener('abort', abort); };
      this.eventWaiters.add(wake);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  private async stopAndDispose(): Promise<void> {
    if (this.disposed) return;
    try { await this.transport.request('session/stop', { sessionId: this.sessionId }); } catch { /* best effort */ }
    await this.dispose();
  }
}
