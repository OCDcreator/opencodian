/* eslint-disable max-lines -- The backend façade intentionally co-locates the AgentService capability seams; stable protocol responsibilities remain in adjacent ZCode modules. */

/**
 * ZCodeAdapter — OpenCodian's isolated boundary to the official ZCode
 * runtime (`app-server --stdio` structured protocol).
 *
 * This adapter owns exactly one child process per start; it never touches the
 * already-open ZCode desktop UI, never parses terminal prose, and never
 * mutates the user's ZCode configuration. Capability negotiation happens
 * over the official `runtime/capabilities` request; anything the runtime does
 * not report stays `null` (unavailable) instead of being fabricated. Chat
 * sends map `session/event` deltas through `ZCodeStreamMapper`; cancellation
 * stops only the native turn and leaves the session usable.
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import { prependMemoryInjection } from '../../../memory';
import { prependObsidianToolingInjection } from '../../../obsidianTooling';
import type { PermissionReply, PermissionRequest, QuestionRequest } from '../../../types';
import type { ContextUsageSnapshot, StreamChunk } from '../../../types/chat';
import { AgentCapability, type BackendCapabilities } from '../../AgentCapability';
import type {
  AgentAuxQueryCapability,
  AuxQuerySession,
  AuxQuerySessionConfig,
  BackendModelSelection,
} from '../AgentAuxQueryCapability';
import type {
  AgentInlineCompletionCapability,
  InlineCompletionSession,
  InlineCompletionSessionConfig,
} from '../AgentInlineCompletionCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentForkCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from '../AgentService';
import {
  normalizeZCodeHandshakeFailure,
  ZCodeAppServerTransport,
  ZCodeRemoteRequestError,
  ZCodeTransportError,
} from './ZCodeAppServerTransport';
import { ZCodeAuxQuerySession } from './ZCodeAuxQuerySession';
import { openZCodeDesktopTaskIndex, type ZCodeDesktopTaskIndex } from './ZCodeDesktopTaskIndex';
import { hasInvalidZCodeImageAttachment, toZCodeImageInput, verifyZCodeImageModelForSend, zCodeImageModelUnavailableChunk, zCodeImageRejectionChunk } from './ZCodeImageAttachment';
import { ZCodeInlineCompletionSession } from './ZCodeInlineCompletionSession';
import {
  ZCodeInteractionBridge,
  type ZCodeInteractionReply,
} from './ZCodeInteractionBridge';
import {
  parseZCodeDefaultModel,
  type ZCodeModelCatalog,
  ZCodeModelSurface,
  type ZCodeSlashCommandEntry,
} from './ZCodeModelCatalog';
import { asRecordValue, redactZCodeDiagnosticText } from './ZCodeProtocolTypes';
import {
  parseZCodeRuntimeCapabilities,
  type ZCodeRuntimeCapabilities,
} from './ZCodeProtocolTypes';
import type { ZCodeProviderConfigSnapshot } from './ZCodeProviderConfigDiscovery';
import {
  discoverZCodeProviderConfig,
  type ZCodeProviderConfigDiscoveryOptions,
} from './ZCodeProviderConfigDiscovery';
import {
  getZCodeRuntimeErrorMessage,
  resolveOfficialZCodeDesktopBundle,
  resolveZCodeRuntime,
  type ZCodeRuntimeLaunch,
  type ZCodeRuntimeResolution,
  type ZCodeRuntimeResolverOptions,
} from './ZCodeRuntimeResolver';
import { readZCodeContextUsage, toZCodeSessionEvent, type ZCodeSessionEvent, ZCodeStreamMapper } from './ZCodeStreamMapper';

/** Honest handshake state for the settings/status surface. */
export type ZCodeHandshakeState = 'idle' | 'connecting' | 'ready' | 'failed';

/** One in-flight foreground turn: its event queue and cancellation flag. */
interface ZCodeActiveRun {
  cancelled: boolean;
  closed: boolean;
  readonly queue: ZCodeSessionEvent[];
  /** Prebuilt surface chunks (permission/question asks) injected mid-turn. */
  readonly chunks: StreamChunk[];
  wake: (() => void) | null;
}

interface ZCodeControlCommandResult {
  promptText: string;
  goalTargetId: string | null;
  terminalChunks: StreamChunk[] | null;
}

export interface ZCodeAdapterRuntimeDiagnostics {
  readonly resolution: ZCodeRuntimeResolution | null;
  readonly providerConfig: ZCodeProviderConfigSnapshot | null;
  readonly handshake: ZCodeHandshakeState;
  readonly capabilities: ZCodeRuntimeCapabilities | null;
  readonly lastError: string | null;
  /** Negotiated ZCode Protocol version from session/create (null until observed). */
  readonly protocolVersion: number | null;
}

export interface ZCodeCompactionReadback {
  readonly acknowledged: boolean;
  readonly completed: boolean;
  readonly tokenUsageObserved: boolean;
  readonly operationId: string | null;
  readonly terminalStatus: 'completed' | 'failed' | 'cancelled' | 'skipped' | null;
}

function readManualCompactionEvent(
  raw: unknown,
  sessionId: string,
  afterSeq: number,
): { operationId: string; status: string } | null {
  const event = asRecordValue(raw);
  const payload = asRecordValue(event['payload']);
  if (event['type'] !== 'session.updated' || event['sessionId'] !== sessionId
    || typeof event['seq'] !== 'number' || event['seq'] <= afterSeq
    || payload['trigger'] !== 'manual' || payload['compactReason'] !== 'user_requested'
    || typeof payload['operationId'] !== 'string'
    || !/^cmp_[0-9a-f-]{36}$/.test(payload['operationId'])
    || typeof payload['status'] !== 'string') return null;
  return { operationId: payload['operationId'], status: payload['status'] };
}

export interface ZCodeAdapterOptions {
  /** Working directory for the owned app-server (the active vault). */
  workingDirectory?: string;
  /** Live settings reader (executable override changes apply on next start). */
  getSettings?: () => { executablePath?: string };
  /** Extra environment for the owned process (domain environment). */
  getExtraEnv?: () => Record<string, string>;
  /** Injectable seams for focused tests. */
  resolveRuntime?: (options: ZCodeRuntimeResolverOptions) => ZCodeRuntimeResolution;
  discoverProviderConfig?: (options: ZCodeProviderConfigDiscoveryOptions) => ZCodeProviderConfigSnapshot;
  createTransport?: (options: ConstructorParameters<typeof ZCodeAppServerTransport>[0]) => ZCodeAppServerTransport;
  openTaskIndex?: (entryPath: string, dataRoot: string) => ZCodeDesktopTaskIndex;
  handshakeTimeoutMs?: number;
}

/**
 * The official app-server defines `sessionUnavailable` as JSON-RPC -32004;
 * `session/resume` uses it when the deferred id has no persisted record.
 * This request does not supply an additional domain data code. Do not fall
 * back to matching the diagnostic message: it is mutable upstream and may
 * contain user data.
 */
function isZCodeDeferredSessionMissingError(error: unknown): boolean {
  return error instanceof ZCodeRemoteRequestError
    && error.method === 'session/resume'
    && error.code === -32004;
}

type ZCodeBackgroundTask = { taskId: string; status: string; description: string; cancellable: boolean };

function readBackgroundLaunches(messages: unknown[], sessionId: string): Map<string, ZCodeBackgroundTask> {
  const tasks = new Map<string, ZCodeBackgroundTask>();
  for (const value of messages) {
    const message = asRecordValue(value);
    const info = asRecordValue(message['info']);
    if (info['sessionId'] !== sessionId || info['role'] !== 'assistant') continue;
    const parts = message['parts'];
    for (const value of Array.isArray(parts) ? parts : []) {
      const part = asRecordValue(value);
      const state = asRecordValue(part['state']);
      const input = asRecordValue(state['input']);
      if (part['type'] !== 'tool' || part['tool'] !== 'Bash'
        || state['status'] !== 'completed' || input['run_in_background'] !== true
        || typeof state['output'] !== 'string') continue;
      const match = /^Command running in background with ID: (exec_[0-9a-f-]{36})\./.exec(state['output']);
      if (!match) continue;
      tasks.set(match[1], {
        taskId: match[1], status: 'unknown',
        description: typeof input['description'] === 'string' ? input['description'] : '',
        cancellable: false,
      });
    }
  }
  return tasks;
}

function readBackgroundEnding(value: unknown, sessionId: string): ZCodeBackgroundTask | null {
  const message = asRecordValue(value);
  const info = asRecordValue(message['info']);
  if (info['sessionId'] !== sessionId || info['role'] !== 'user'
    || info['source'] !== 'background_task' || info['synthetic'] !== true) return null;
  const metadata = asRecordValue(info['metadata']);
  const origin = asRecordValue(metadata['originMeta']);
  const taskId = origin['workId'];
  if (metadata['inputPresentation'] !== 'task_notification'
    || typeof taskId !== 'string' || !/^exec_[0-9a-f-]{36}$/.test(taskId)) return null;
  const parts = message['parts'];
  if (!Array.isArray(parts)) return null;
  const notification = parts.map((part) => asRecordValue(part))
    .find((part) => part['type'] === 'text' && typeof part['text'] === 'string');
  const body = notification?.['text'];
  if (typeof body !== 'string') return null;
  const idMatch = /<task-id>\s*(exec_[0-9a-f-]{36})\s*<\/task-id>/.exec(body);
  const statusMatch = /<status>\s*(completed|failed|killed)\s*<\/status>/.exec(body);
  if (idMatch?.[1] !== taskId || !statusMatch) return null;
  return {
    taskId,
    status: statusMatch[1] === 'killed' ? 'stopped' : statusMatch[1],
    description: typeof origin['title'] === 'string' ? origin['title'] : '',
    cancellable: false,
  };
}

export class ZCodeAdapter implements AgentService, AgentChatCapability, AgentSessionCapability, AgentForkCapability, AgentQuestionCapability, AgentPermissionCapability, AgentAuxQueryCapability, AgentInlineCompletionCapability {
  readonly kind = 'zcode' as const;
  readonly displayName = 'ZCode';
  readonly description = 'Official ZCode runtime · OpenCodian-owned app-server';

  /** Chat + native sessions + fork/compaction are wired; tools/permissions/models land in their own tickets. */
  readonly capabilities: BackendCapabilities = new Set<AgentCapability>([
    AgentCapability.Chat,
    AgentCapability.Sessions,
    AgentCapability.Fork,
    AgentCapability.Compaction,
    AgentCapability.Questions,
    AgentCapability.Permissions,
    AgentCapability.Models,
    AgentCapability.Context,
    AgentCapability.Thinking,
    AgentCapability.Images,
    AgentCapability.InlineCompletion,
    AgentCapability.AuxQuery,
  ]);

  private currentStatus: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>();
  private transport: ZCodeAppServerTransport | null = null;
  private startPromise: Promise<void> | null = null;
  private resolution: ZCodeRuntimeResolution | null = null;
  private providerConfig: ZCodeProviderConfigSnapshot | null = null;
  private handshake: ZCodeHandshakeState = 'idle';
  private capabilitiesReadback: ZCodeRuntimeCapabilities | null = null;
  private lastError: string | null = null;
  /** Negotiated ZCode Protocol version from session/create (null until observed). */
  private protocolVersion: number | null = null;
  private readonly handshakeTimeoutMs: number;
  private readonly sessionRuns = new Map<string, ZCodeActiveRun>();
  /** Native terminal events may arrive after the foreground iterator closes. */
  private readonly backgroundTaskEndings = new Map<string, Map<string, { task: ZCodeBackgroundTask; seq: number }>>();
  private readonly backgroundTaskReadUnsupported = new WeakSet<ZCodeAppServerTransport>();
  /** Native stop acknowledgements gate the next send even if the UI abandoned its old iterator. */
  private readonly stoppingSessions = new Map<string, Promise<void>>();
  private readonly interactions = new ZCodeInteractionBridge();
  /** Latest live model/thinking/slash catalog observed from the runtime. */
  private readonly modelSurface = new ZCodeModelSurface();

  constructor(private readonly options: ZCodeAdapterOptions = {}) {
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 15000;
  }

  get status(): AgentConnectionStatus {
    return this.currentStatus;
  }

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return { dispose: () => { this.statusHandlers.delete(handler); } };
  }

  /** Honest state snapshot for settings/diagnostics surfaces. */
  getRuntimeDiagnostics(): ZCodeAdapterRuntimeDiagnostics { return { resolution: this.resolution, providerConfig: this.providerConfig, handshake: this.handshake, capabilities: this.capabilitiesReadback, lastError: this.lastError, protocolVersion: this.protocolVersion }; }

  /**
   * Discover the runtime, inject the provider configuration the official
   * runtime requires, start the owned app-server, and complete the
   * capability handshake. Failure paths leave no orphan process.
   */
  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.doStart().catch((error) => {
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.setStatus('connecting');
    this.handshake = 'connecting';
    this.lastError = null;

    const resolveRuntime = this.options.resolveRuntime ?? resolveZCodeRuntime;
    const settings = this.options.getSettings?.() ?? {};
    const resolution = resolveRuntime({
      ...(settings.executablePath ? { executablePath: settings.executablePath } : {}),
    });
    this.resolution = resolution;
    if (resolution.mode !== 'ready') {
      const message = getZCodeRuntimeErrorMessage(resolution);
      this.failStart(message, 'ZCode runtime not found. Check ZCODE_AGENT_WORKDIR or the configured executable.');
      throw new Error(message);
    }

    const discoverProviderConfig = this.options.discoverProviderConfig ?? discoverZCodeProviderConfig;
    const providerConfig = discoverProviderConfig({ entryPath: resolution.launch.entryPath });
    this.providerConfig = providerConfig;

    const createTransport = this.options.createTransport ?? ((options) => new ZCodeAppServerTransport(options));
    const transport = createTransport({
      launch: resolution.launch as ZCodeRuntimeLaunch,
      extraEnv: { ...providerConfig.env, ...(this.options.getExtraEnv?.() ?? {}) },
      ...(this.options.workingDirectory ? { workingDirectory: this.options.workingDirectory } : {}),
      requestTimeoutMs: this.handshakeTimeoutMs,
      onExit: () => {
        // Only the CURRENT transport's exit affects this adapter: a disposed
        // predecessor's late exit (restart cycle) must never poison a fresh
        // lifecycle. In-flight turns end scoped instead of hanging on a
        // stream that can never deliver again.
        if (this.transport !== transport) {
          return;
        }
        this.closeAllRuns();
        this.interactions.settlePendingForTeardown();
        if (this.currentStatus === 'connected' || this.currentStatus === 'connecting') {
          this.lastError = 'ZCode app-server process exited.';
          this.handshake = this.handshake === 'ready' ? 'failed' : this.handshake;
          this.setStatus('error');
        }
      },
    });
    this.transport = transport;
    // Host-facing asks the official runtime issues during session
    // materialization. Answered honestly (no native search enhancement, no
    // MCP auth headers) so session/create can never deadlock on an ask.
    transport.onServerRequest('session/requestRuntimePreferences', () => ({
      nativeSearchEnhancementsEnabled: false,
    }));
    transport.onServerRequest('interaction/requestOfficialMcpAuthHeaders', () => ({
      headers: {},
    }));
    transport.onServerRequest('interaction/requestPermission', (params) => {
      return this.handleInteractionAsk('permission', params);
    });
    transport.onServerRequest('interaction/requestUserInput', (params) => {
      return this.handleInteractionAsk('user-input', params);
    });
    transport.onNotification('session/event', (params) => {
      if (this.transport === transport) this.handleSessionEvent(params);
    });
    transport.onNotification('state.updated', (params) => { this.modelSurface.handleStateUpdated(params); });

    try {
      await transport.start();
    } catch (error) {
      transport.dispose();
      this.transport = null;
      const message = `Failed to start the ZCode app-server process: ${String(error)}`;
      this.failStart(message);
      throw error instanceof Error ? error : new Error(message);
    }

    try {
      const result = await transport.request('runtime/capabilities', {});
      this.capabilitiesReadback = parseZCodeRuntimeCapabilities(result);
      this.handshake = 'ready';
      this.setStatus('connected');
    } catch (error) {
      transport.dispose();
      this.transport = null;
      const message = normalizeZCodeHandshakeFailure(error);
      this.failStart(message, error instanceof ZCodeTransportError && error.reason === 'timeout'
        ? 'ZCode capability handshake timed out.' : undefined);
      throw new Error(message);
    }
  }

  /** Stop the owned app-server process. Idempotent; other backends are unaffected. */
  async stop(): Promise<void> {
    this.startPromise = null;
    const transport = this.transport;
    this.transport = null;
    this.closeAllRuns();
    this.stoppingSessions.clear();
    this.interactions.settlePendingForTeardown();
    transport?.dispose();
    this.handshake = this.handshake === 'ready' ? 'idle' : this.handshake;
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.startPromise = null;
    this.closeAllRuns();
    this.stoppingSessions.clear();
    this.interactions.settlePendingForTeardown();
    this.transport?.dispose();
    this.transport = null;
    this.statusHandlers.clear();
  }

  // Chat (AgentChatCapability)
  // -------------------------------------------------------------------------

  /**
   * Send one text prompt and stream the turn. The official runtime accepts
   * sends asynchronously and delivers the turn over `session/event`; this
   * generator maps those events onto the backend-neutral stream contract and
   * always closes with the finalization boundary (`message_stop`).
   */
  async *sendMessage(rawRequest: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const id = rawRequest.sessionId;
    await this.stoppingSessions.get(id);
    const slash = /^\/(goal|compact|plan)(?:\s+([\s\S]*))?$/i.exec(rawRequest.content.trim());
    const slashName = slash?.[1]?.toLowerCase();
    if (slashName && rawRequest.images?.length) {
      yield { type: 'error', content: 'ZCode native control commands cannot carry image attachments.' };
      return;
    }
    if (rawRequest.images?.length) {
      if (hasInvalidZCodeImageAttachment(rawRequest.images)) {
        yield zCodeImageRejectionChunk(rawRequest.images);
        return;
      }
    }
    if (this.sessionRuns.has(id)) {
      throw new Error('ZCode session is busy.');
    }
    const transport = this.requireTransport();
    const run: ZCodeActiveRun = { cancelled: false, closed: false, queue: [], chunks: [], wake: null };
    this.sessionRuns.set(id, run);
    try {
      // A new app-server does not know previously created sessions. Resume
      // before subscribing, including the first send after process recovery.
      await this.ensureSessionActive(transport, id);
      await transport.request('session/subscribe', { sessionId: id, deliveryKind: 'desktop-continuous' });
      await this.modelSurface.prepareModelForSend(transport, (sid) => this.ensureSessionActive(transport, sid), rawRequest);
      if (rawRequest.images?.length) {
        const imageReady = await verifyZCodeImageModelForSend({
          ensureSessionActive: () => this.ensureSessionActive(transport, id),
          readSession: async () => asRecordValue(await transport.request('session/read', { sessionId: id })),
          captureSnapshot: (snapshot) => this.modelSurface.captureCatalogSnapshot(snapshot),
          currentModel: () => this.modelSurface.getAvailableModelCatalog()?.currentModel ?? null,
          supportsImages: () => this.modelSurface.supportsImagesForCurrentModel(),
        });
        if (!imageReady) {
          yield zCodeImageModelUnavailableChunk();
          return;
        }
      }
      if (run.cancelled) return;
      const control = await this.prepareNativeControlCommand(transport, {
        sessionId: id, content: rawRequest.content, slashName, rawArgument: slash?.[2],
      });
      for (const chunk of control.terminalChunks ?? []) yield chunk;
      if (control.terminalChunks) return;
      const { promptText, goalTargetId } = control;
      // The backend-neutral memory and Obsidian-tooling injections ride at the
      // front of the prompt text, matching the other prompt-prefix adapters.
      const content = prependObsidianToolingInjection(
        prependMemoryInjection(promptText, rawRequest.options),
        rawRequest.options,
      );
      if (slashName !== 'goal') await transport.request('session/send', {
        sessionId: id,
        content,
        ...(rawRequest.images?.length ? { attachments: rawRequest.images.map(toZCodeImageInput) } : {}),
      });
      yield* this.streamNativeTurn(id, run, goalTargetId);
    } finally {
      this.releaseSessionRun(id, run);
    }
  }

  private async *streamNativeTurn(
    id: string, run: ZCodeActiveRun, goalTargetId: string | null,
  ): AsyncGenerator<StreamChunk> {
    const mapper = new ZCodeStreamMapper(id);
    let goalTargetStarted = false;
    for (;;) {
      const surfaceChunk = run.chunks.shift();
      if (surfaceChunk) {
        yield surfaceChunk;
        continue;
      }
      const event = run.queue.shift();
      if (event) {
        if (goalTargetId && !goalTargetStarted) {
          const payload = asRecordValue(asRecordValue(event)['payload']);
          if (asRecordValue(event)['type'] !== 'turn.started' || payload['targetId'] !== goalTargetId) {
            continue;
          }
          goalTargetStarted = true;
        }
        for (const chunk of mapper.map(event)) {
          yield chunk;
        }
        if (mapper.outcome !== 'streaming') {
          break;
        }
        continue;
      }
      if (run.cancelled) {
        break;
      }
      if (run.closed) {
        if (mapper.outcome === 'streaming') {
          yield { type: 'error', content: 'ZCode connection closed before the turn completed.' };
        }
        break;
      }
      await new Promise<void>((resolve) => {
        run.wake = resolve;
      });
    }
    const userUuid = run.cancelled ? null : mapper.userMessageIdValue;
    if (userUuid) {
      yield { type: 'user_message_identity', uuid: userUuid, sessionId: id };
    }
    const assistantId = run.cancelled ? null : mapper.assistantMessageId;
    if (assistantId) {
      yield { type: 'message_metadata', messageId: assistantId, timestamp: Date.now(), sessionId: id };
    }
    yield { type: 'message_stop' };
  }

  private async prepareNativeControlCommand(
    transport: ZCodeAppServerTransport,
    input: { sessionId: string; content: string; slashName?: string; rawArgument?: string },
  ): Promise<ZCodeControlCommandResult> {
    const { sessionId, content, slashName, rawArgument } = input;
    if (slashName === 'goal') return this.prepareGoalCommand(transport, sessionId, rawArgument);
    if (slashName === 'compact') {
      const result = await this.compactSession(sessionId, rawArgument?.trim() || undefined);
      return {
        promptText: content, goalTargetId: null,
        terminalChunks: result.completed
          ? [{ type: 'message_start' }, { type: 'text', content: result.terminalStatus ?? 'completed' }, { type: 'message_stop' }]
          : [{ type: 'error', content: 'ZCode context compaction was not confirmed.' }],
      };
    }
    if (slashName === 'plan') {
      await this.setSessionMode(sessionId, 'plan');
      if (await this.readSessionMode(sessionId) !== 'plan') {
        return { promptText: content, goalTargetId: null,
          terminalChunks: [{ type: 'error', content: 'ZCode Plan mode was not confirmed by native readback.' }] };
      }
      const promptText = rawArgument?.trim() ?? '';
      return { promptText, goalTargetId: null, terminalChunks: promptText ? null
        : [{ type: 'message_start' }, { type: 'text', content: 'PLAN' }, { type: 'message_stop' }] };
    }
    return { promptText: content, goalTargetId: null, terminalChunks: null };
  }

  private async prepareGoalCommand(
    transport: ZCodeAppServerTransport, sessionId: string, rawArgument?: string,
  ): Promise<ZCodeControlCommandResult> {
    const argument = rawArgument?.trim() ?? '';
    const command = /^(pause|clear|show|resume)$/i.exec(argument)?.[1]?.toLowerCase();
    const replace = /^replace\s+([\s\S]+)$/i.exec(argument);
    const action = command ?? (replace ? 'replace' : 'set');
    const objective = replace?.[1]?.trim() ?? argument;
    if ((action === 'set' || action === 'replace') && !objective) {
      return { promptText: '', goalTargetId: null,
        terminalChunks: [{ type: 'error', content: 'ZCode /goal requires an objective.' }] };
    }
    const goalResult = asRecordValue(await transport.request('session/goal', {
      sessionId, action,
      ...(action === 'set' || action === 'replace' ? { objective } : {}),
    }));
    const readback = asRecordValue(await transport.request('session/read', { sessionId }));
    const projection = asRecordValue(readback['projection']);
    const target = asRecordValue(projection['target']);
    this.assertGoalReadback({ sessionId, action, objective, projection, target });
    if (goalResult['startedTurn'] !== true) {
      const response = goalResult['response'];
      return { promptText: '', goalTargetId: null, terminalChunks: [
        ...(typeof response === 'string' && response
          ? [{ type: 'message_start' } as StreamChunk, { type: 'text', content: response } as StreamChunk] : []),
        { type: 'message_stop' },
      ] };
    }
    // The controlOnly turn has no body. Stream only the real turn with this target ID.
    if (target['sessionId'] !== sessionId || typeof target['targetId'] !== 'string' || !target['targetId']) {
      throw new Error('ZCode goal readback returned no target identity.');
    }
    return { promptText: '', goalTargetId: target['targetId'], terminalChunks: null };
  }

  private assertGoalReadback(input: {
    sessionId: string; action: string; objective: string;
    projection: Record<string, unknown>; target: Record<string, unknown>;
  }): void {
    const { sessionId, action, objective, projection, target } = input;
    if ((action === 'set' || action === 'replace')
      && (target['sessionId'] !== sessionId || target['objective'] !== objective)) {
      throw new Error('ZCode goal readback did not confirm the current session objective.');
    }
    if (action === 'clear' && projection['target'] !== null) {
      throw new Error('ZCode goal clear was not confirmed by native readback.');
    }
    if (action === 'pause' && (target['sessionId'] !== sessionId || target['status'] !== 'paused')) {
      throw new Error('ZCode goal pause was not confirmed by native readback.');
    }
    if (action === 'resume' && (target['sessionId'] !== sessionId || target['status'] !== 'active')) {
      throw new Error('ZCode goal resume was not confirmed by native readback.');
    }
  }

  /** A cancelled iterator's delayed finally cannot release its replacement run. */
  private releaseSessionRun(sessionId: string, run: ZCodeActiveRun): void {
    if (this.sessionRuns.get(sessionId) === run) this.sessionRuns.delete(sessionId);
  }

  /**
   * Stop only this session's native turn and close its stream; the session
   * stays usable for a subsequent prompt.
   */
  async cancelStream(sessionId: string): Promise<void> {
    this.interactions.settlePendingForTeardown(sessionId);
    const run = this.sessionRuns.get(sessionId);
    if (run) {
      run.cancelled = true;
      run.wake?.();
      run.wake = null;
      // The UI cancels its consumer without necessarily resuming the async
      // generator. Detach now; its finally may run much later.
      this.sessionRuns.delete(sessionId);
    }
    const transport = this.transport;
    if (!transport) return;
    const stopping = transport.request('session/stop', { sessionId })
      .then(() => undefined, () => undefined);
    this.stoppingSessions.set(sessionId, stopping);
    try {
      await stopping;
    } finally {
      if (this.stoppingSessions.get(sessionId) === stopping) this.stoppingSessions.delete(sessionId);
    }
  }

  // -------------------------------------------------------------------------
  // Native sessions (AgentSessionCapability)
  // -------------------------------------------------------------------------

  /** Map a new OpenCodian conversation to a ZCode native session id. */
  async createSession(_title?: string, _options?: Record<string, unknown>): Promise<string> {
    const transport = this.requireTransport();
    const workspacePath = this.options.workingDirectory ?? '';
    if (!workspacePath) {
      throw new Error('ZCode session creation requires a vault workspace path.');
    }
    const result = await transport.request('session/create', {
      workspace: { workspaceKey: workspacePath, workspacePath },
    });
    this.modelSurface.captureCatalogSnapshot(result, true);
    // Negotiated protocol version travels with the create snapshot.
    const version = asRecordValue(asRecordValue(result)['protocol'])['version'];
    if (typeof version === 'number') {
      this.protocolVersion = version;
    }
    const session = asRecordValue(asRecordValue(result)['session']);
    const sessionId = session['sessionId'];
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('ZCode session/create returned no session id.');
    await this.modelSurface.applyPersistedDefaults(transport, (sid) => this.ensureSessionActive(transport, sid), sessionId, (this.options.getSettings?.() ?? {}) as { model?: string; thinkingLevel?: string; mode?: string });
    return sessionId;
  }

  /**
   * Recreate only an unmaterialized native session that the official runtime
   * has conclusively reported as absent.  ZCode's deferred `session/create`
   * identity may disappear before its first send; a conversation with history
   * must never call this method because a new id would sever that history.
   *
   * Returns `null` when the original session resumed, otherwise the freshly
   * created native id.  `createSession()` deliberately owns the replacement
   * path so configured model, thought level, and mode defaults are applied at
   * the same native materialization boundary as ordinary new conversations.
   */
  async recreateDeferredSessionIfMissing(sessionId: string): Promise<string | null> {
    await this.start();
    const transport = this.requireTransport();
    try {
      await this.ensureSessionActive(transport, sessionId);
      return null;
    } catch (error) {
      if (!isZCodeDeferredSessionMissingError(error)) {
        throw error;
      }
      return this.createSession();
    }
  }

  /**
   * List native sessions as raw records; the routing layer normalizes rows
   * (`sessionId`/`title`/`updatedAt`) per backend kind.
   */
  async listSessions(): Promise<unknown[]> {
    const transport = this.requireTransport();
    const result = await transport.request('session/list', {});
    const sessions = asRecordValue(result)['sessions'];
    if (!Array.isArray(sessions)) return [];
    const resolution = this.resolution;
    if (resolution?.mode !== 'ready' || path.basename(resolution.launch.entryPath) !== 'zcode.cjs' || !this.options.workingDirectory) return sessions;
    const repo = this.openTaskIndex();
    try {
      const workspacePath = this.options.workingDirectory ?? '';
      const deleted = new Set(await repo.listDeletedTaskIds({ workspacePath, provider: 'glm' }));
      return sessions.filter((session) => !deleted.has(asRecordValue(session)['sessionId'] as string));
    } finally {
      repo.close();
    }
  }

  /**
   * Read one native session record (`session/read` snapshot's `session`
   * field). Reading requires the session to be active in the owned process,
   * so this resumes first — resume is idempotent in the official protocol.
   */
  async getSession(sessionId: string): Promise<unknown | null> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const snapshot = asRecordValue(await transport.request('session/read', { sessionId }));
    this.modelSurface.captureCatalogSnapshot(snapshot);
    const session = snapshot['session'];
    return session && typeof session === 'object' ? session : null;
  }

  /**
   * Read native messages as raw `{ info, parts }` records for per-kind
   * hydration. Optional `limit` / `afterMessageId` map to the native
   * pagination fields.
   */
  async getSessionMessages(sessionId: string, options?: Record<string, unknown>): Promise<unknown[]> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const limit = typeof options?.['limit'] === 'number' ? options['limit'] as number : undefined;
    const afterMessageId = typeof options?.['afterMessageId'] === 'string' ? options['afterMessageId'] as string : undefined;
    const result = asRecordValue(await transport.request('session/messages', {
      sessionId,
      ...(limit !== undefined ? { limit } : {}),
      ...(afterMessageId !== undefined ? { afterMessageId } : {}),
    }));
    const messages = result['messages'];
    return Array.isArray(messages) ? messages : [];
  }

  /**
   * Read the native subagent linkage of a session (`session/subagents`):
   * `{ revision, childSessionIds, running, ended }` — ids are native-stable
   * and pass through unchanged (no local synthesis).
   */
  async getSessionSubagents(sessionId: string): Promise<Record<string, unknown>> { const transport = this.requireTransport(); await this.ensureSessionActive(transport, sessionId); return asRecordValue(await transport.request('session/subagents', { sessionId })); }

  /** Native background task IDs and terminal states for the visible chat panel. */
  async getBackgroundTasks(sessionId: string): Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const snapshot = asRecordValue(await transport.request('session/read', { sessionId }));
    const jobs = asRecordValue(snapshot['projection'])['backgroundJobs'];
    const messages = snapshot['messages'];
    const persisted = Array.isArray(messages) ? messages : [];
    const tasks = readBackgroundLaunches(persisted, sessionId);
    for (const value of persisted) {
      const ending = readBackgroundEnding(value, sessionId);
      if (!ending) continue;
      const launched = tasks.get(ending.taskId);
      tasks.set(ending.taskId, { ...ending, description: launched?.description || ending.description });
    }
    for (const value of Array.isArray(jobs) ? jobs : []) {
      const job = asRecordValue(value);
      const taskId = job['taskId'];
      if (typeof taskId !== 'string' || taskId.length === 0) continue;
      tasks.set(taskId, {
        taskId,
        status: typeof job['status'] === 'string' ? job['status'] : 'unknown',
        description: typeof job['description'] === 'string' ? job['description'] : '',
        cancellable: job['cancellable'] === true,
      });
    }
    const liveIds = new Set((Array.isArray(jobs) ? jobs : []).map((value) => asRecordValue(value)['taskId']));
    for (const [taskId, ending] of this.backgroundTaskEndings.get(sessionId) ?? []) {
      if (liveIds.has(taskId)) continue;
      const prior = tasks.get(taskId);
      if (!prior || prior.status === 'unknown') {
        tasks.set(taskId, { ...ending.task, description: prior?.description || ending.task.description });
      }
    }
    await this.readUnknownBackgroundTaskEndings(transport, sessionId, tasks);
    return [...tasks.values()];
  }

  private async readUnknownBackgroundTaskEndings(
    transport: ZCodeAppServerTransport,
    sessionId: string,
    tasks: Map<string, ZCodeBackgroundTask>,
  ): Promise<void> {
    if (this.backgroundTaskReadUnsupported.has(transport)
      || this.capabilitiesReadback?.raw['backgroundTaskRead'] !== true) return;
    for (const [taskId, task] of tasks) {
      if (task.status !== 'unknown' && task.status !== 'running') continue;
      try {
        const native = asRecordValue(await transport.request('session/backgroundTaskRead', { sessionId, taskId }));
        if (native['sessionId'] !== sessionId || native['taskId'] !== taskId) continue;
        const status = native['status'];
        // session/read 的 running 投影可能属于已被 SIGKILL 的旧进程。
        // journal 尚无可核验终态时，撤去取消按钮，继续轮询同一 task ID。
        if (status === 'unknown' && task.status === 'running') {
          tasks.set(taskId, { ...task, status: 'unknown', cancellable: false });
          continue;
        }
        const terminal = status === 'timed_out' || status === 'spawn_error' ? 'failed' : status;
        if (terminal !== 'completed' && terminal !== 'failed' && terminal !== 'cancelled') continue;
        tasks.set(taskId, { ...task, status: terminal, cancellable: false });
      } catch (error) {
        if (error instanceof ZCodeRemoteRequestError && error.code === -32601) {
          this.backgroundTaskReadUnsupported.add(transport);
          return;
        }
        // An unavailable or failed native read does not establish a task result.
      }
    }
  }

  /** Cancel one task by its native ID, then verify a terminal native readback. */
  async cancelBackgroundTask(sessionId: string, taskId: string): Promise<boolean> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const result = asRecordValue(await transport.request('session/cancelBackgroundTask', { sessionId, taskId }));
    const tasks = await this.getBackgroundTasks(sessionId);
    return result['cancelled'] === true && tasks.some((task) => task.taskId === taskId && task.status === 'cancelled');
  }

  // -------------------------------------------------------------------------
  // Auxiliary queries / text-completion probe
  // -------------------------------------------------------------------------

  /**
   * Rejects fail-closed until a dedicated scope has completed the required
   * audit. The official protocol has real allow/deny enforcement and native
   * message tool readback, but this adapter currently shares user storage and
   * has not proven an isolated lifecycle, image turn, no-write snapshot, and
   * cleanup. No generic auxiliary session is started — never a degraded unsafe
   * mode.
   */
  async startAuxQuerySession(config: AuxQuerySessionConfig): Promise<AuxQuerySession> {
    const resolution = this.resolution;
    const providerConfig = this.providerConfig;
    if (!resolution || resolution.mode !== 'ready') {
      throw new Error('ZCode auxiliary session requires a ready native runtime.');
    }
    if (!providerConfig || providerConfig.state !== 'validated') {
      throw new Error('ZCode auxiliary session requires validated provider configuration.');
    }
    const workingDirectory = typeof config?.workingDirectory === 'string' ? config.workingDirectory.trim() : '';
    if (!workingDirectory) throw new Error('ZCode auxiliary session requires a workspace path.');
    const createTransport = this.options.createTransport
      ?? ((transportOptions: ConstructorParameters<typeof ZCodeAppServerTransport>[0]) => new ZCodeAppServerTransport(transportOptions));
    const auxOptions = {
      launch: resolution.launch,
      providerConfigEnv: providerConfig.env,
      workingDirectory,
      systemPrompt: config.systemPrompt,
      ...(config.model ? { model: config.model } : {}),
      ...(config.turnTimeoutMs !== undefined ? { turnTimeoutMs: config.turnTimeoutMs } : {}),
    };
    return this.options.createTransport
      ? ZCodeAuxQuerySession.create({ ...auxOptions, createTransport: (transportOptions) => createTransport(transportOptions) })
      : ZCodeAuxQuerySession.create(auxOptions);
  }

  /**
   * Build the sessionless text-completion channel. Its native request has an
   * empty tool list and a four-second cancellation budget; slower providers
   * may time out without creating a chat session.
   */
  async startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession> {
    const catalog = this.modelSurface.getAvailableModelCatalog();
    if (!catalog) {
      throw new Error('ZCode inline completion requires an observed native model catalog. Start or restore a ZCode chat first.');
    }
    const model = resolveZCodeInlineCompletionModel(config.model, catalog.currentModel);
    if (!model) {
      throw new Error('ZCode inline completion requires a selected native model.');
    }
    const workingDirectory = config.workingDirectory.trim();
    if (!workingDirectory) {
      throw new Error('ZCode inline completion requires a vault workspace path.');
    }
    return ZCodeInlineCompletionSession.create({
      transport: this.requireTransport(),
      catalog,
      model,
      workingDirectory,
      systemPrompt: config.systemPrompt,
    });
  }

  /** Apply the official desktop task-index tombstone, never V4 handle close. */
  async deleteSession(sessionId: string): Promise<void> {
    const workspacePath = this.options.workingDirectory ?? '';
    if (!sessionId || !workspacePath) throw new Error('ZCode session deletion requires a session ID and workspace.');
    const transport = this.requireTransport();
    const native = asRecordValue(await transport.request('session/list', { sessionIds: [sessionId] }));
    const row = (Array.isArray(native['sessions']) ? native['sessions'] : [])
      .map(asRecordValue).find((session) => session['sessionId'] === sessionId);
    // A deferred empty session has no persisted index row; the official V4
    // command merely disposes that in-process draft.
    if (!row) {
      return this.deleteDeferredSession(transport, sessionId);
    }
    const workspace = asRecordValue(row['workspace']);
    if (workspace['workspacePath'] !== workspacePath || row['sessionKind'] !== 'interactive') {
      throw new Error('ZCode session deletion rejected a workspace or session-kind mismatch.');
    }
    const repo = this.openTaskIndex();
    try {
      const scope = { workspacePath, provider: 'glm' as const };
      const before = new Set(await repo.listDeletedTaskIds(scope));
      if (before.has(sessionId)) return;
      const meta = {
        taskId: sessionId,
        traceId: String(row['traceId'] ?? `zcode-${sessionId}`),
        title: String(row['title'] ?? ''),
        titleOverridden: row['titleSource'] === 'custom',
        workspacePath,
        createdAt: Number(row['createdAt']),
        updatedAt: Number(row['updatedAt']),
        mode: 'default',
        provider: 'glm' as const,
        status: 'completed',
      };
      if (!Number.isFinite(meta.createdAt) || !Number.isFinite(meta.updatedAt)) {
        throw new Error('ZCode session deletion requires native timestamps.');
      }
      const seeded = await repo.seedTaskMetaIfMissing(meta);
      if (seeded.taskId !== sessionId) throw new Error('ZCode task-index seed returned the wrong session.');
      const changed = await repo.updateTaskState({ workspacePath, taskId: sessionId, patch: { deleted: true } });
      if (changed.taskId !== sessionId) throw new Error('ZCode task-index deletion returned the wrong session.');
      const after = new Set(await repo.listDeletedTaskIds(scope));
      if (!after.has(sessionId) || after.size !== before.size + 1
        || [...before].some((id) => !after.has(id))) {
        throw new Error('ZCode task-index deletion was not confirmed for the selected session only.');
      }
    } finally {
      repo.close();
    }
  }

  private async deleteDeferredSession(transport: ZCodeAppServerTransport, sessionId: string): Promise<void> {
    const raw = asRecordValue(await transport.request('session/list', {}));
    if (Array.isArray(raw['sessions']) && raw['sessions'].some((session) => asRecordValue(session)['sessionId'] === sessionId)) {
      throw new Error('ZCode session deletion rejected a session outside this workspace.');
    }
    await this.ensureSessionActive(transport, sessionId);
    const ack = asRecordValue(await transport.request('v4/command', {
      commandId: randomUUID(), clientId: 'opencodian', sessionId,
      type: 'deleteSession', payload: {}, issuedAt: Date.now(),
    }));
    if (ack['status'] !== 'accepted' && ack['status'] !== 'noop') {
      throw new Error('ZCode deferred session deletion was rejected.');
    }
    const after = asRecordValue(await transport.request('session/list', { sessionIds: [sessionId] }));
    if (Array.isArray(after['sessions']) && after['sessions'].length > 0) {
      throw new Error('ZCode deferred session deletion was not confirmed.');
    }
  }

  private openTaskIndex(): ZCodeDesktopTaskIndex {
    const resolution = this.resolution;
    const config = this.providerConfig;
    if (resolution?.mode !== 'ready' || !config) throw new Error('ZCode desktop task index is unavailable.');
    // 本地源码 CLI 可以承载新协议，但桌面任务列表仍由已安装桌面包的官方索引拥有。
    // 两个入口分别解析，避免将 CLI 覆盖路径误当作 TaskIndexRepo 的来源。
    const entryPath = this.options.openTaskIndex
      ? resolution.launch.entryPath
      : resolveOfficialZCodeDesktopBundle() ?? resolution.launch.entryPath;
    return (this.options.openTaskIndex ?? openZCodeDesktopTaskIndex)(entryPath, config.dataRoot);
  }

  /** Official desktop V4 rename; success requires two same-ID native reads. */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const nextTitle = title.trim();
    if (!sessionId || !nextTitle) throw new Error('ZCode session rename requires a session ID and non-empty title.');
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const ack = asRecordValue(await transport.request('v4/command', {
      commandId: randomUUID(),
      clientId: 'opencodian',
      sessionId,
      type: 'renameSession',
      payload: { title: nextTitle },
      issuedAt: Date.now(),
    }));
    if (ack['status'] !== 'accepted' && ack['status'] !== 'noop') {
      throw new Error('ZCode session rename was rejected by the native V4 command.');
    }
    const listed = asRecordValue(await transport.request('session/list', { sessionIds: [sessionId] }));
    const row = (Array.isArray(listed['sessions']) ? listed['sessions'] : [])
      .map(asRecordValue).find((session) => session['sessionId'] === sessionId);
    const read = asRecordValue(await transport.request('session/read', { sessionId }));
    const session = asRecordValue(read['session']);
    if (row?.['title'] !== nextTitle || session['sessionId'] !== sessionId || session['title'] !== nextTitle) {
      throw new Error('ZCode session rename was not confirmed by native list and readback.');
    }
  }

  /** Fork a native session (`session/fork`); native failures propagate honestly. */
  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const result = asRecordValue(await transport.request('session/fork', {
      sessionId,
      ...(messageID ? { messageId: messageID } : {}),
    }));
    const session = asRecordValue(result['session']);
    const snapshotSession = asRecordValue(asRecordValue(result['snapshot'])['session']);
    const id = result['forkedSessionId'] ?? session['sessionId'] ?? result['sessionId'] ?? result['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('ZCode session/fork returned no session identity.');
    }
    const title = snapshotSession['title'] ?? session['title'] ?? result['title'];
    return { id, title: typeof title === 'string' ? title : '' };
  }

  /** Confirm a manual native compaction by its same-session operation and usage. */
  async compactSession(
    sessionId: string,
    customInstructions?: string,
    options: { timeoutMs?: number; onAccepted?: () => void } = {},
  ): Promise<ZCodeCompactionReadback> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const empty: ZCodeCompactionReadback = {
      acknowledged: false, completed: false, tokenUsageObserved: false,
      operationId: null, terminalStatus: null,
    };
    const before = asRecordValue(await transport.request('session/events', { sessionId }));
    const baseline = Math.max(0, ...(Array.isArray(before['events']) ? before['events'] : [])
      .map((event) => asRecordValue(event)['seq'])
      .filter((seq): seq is number => typeof seq === 'number' && Number.isFinite(seq)));
    const usageBefore = asRecordValue(await transport.request('session/usage', { sessionId }));
    const result = asRecordValue(await transport.request('session/compact', {
      sessionId,
      ...(customInstructions ? { instructions: customInstructions } : {}),
    }));
    const compact = asRecordValue(result['compact']);
    if (compact['state'] !== 'accepted' && compact['state'] !== 'already_running') return empty;
    options.onAccepted?.();
    const accepted: ZCodeCompactionReadback = { ...empty, acknowledged: true };
    if (compact['state'] !== 'accepted') return accepted;
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 120_000, 1), 120_000);
    const deadline = Date.now() + timeoutMs;
    let operationId: string | null = null;
    while (this.transport === transport && Date.now() < deadline) {
      let eventResult: Record<string, unknown>;
      try {
        eventResult = asRecordValue(await transport.request('session/events', { sessionId }));
      } catch {
        return { ...accepted, operationId };
      }
      const compactEvents = (Array.isArray(eventResult['events']) ? eventResult['events'] : [])
        .map((event) => readManualCompactionEvent(event, sessionId, baseline))
        .filter((event): event is { operationId: string; status: string } => event !== null);
      const operationIds = [...new Set(compactEvents.map((event) => event.operationId))];
      if (operationIds.length > 1) return accepted;
      if (operationIds.length === 1) operationId = operationIds[0] ?? null;
      if (operationId) {
        const terminal = compactEvents.find((event) => event.operationId === operationId
          && ['completed', 'failed', 'cancelled', 'skipped'].includes(event.status));
        if (terminal) {
          const terminalStatus = terminal.status as ZCodeCompactionReadback['terminalStatus'];
          if (terminalStatus !== 'completed') return { ...accepted, operationId, terminalStatus };
          const verified = await this.verifyNativeCompactionUsage(transport, sessionId, usageBefore);
          return { ...accepted, ...verified, operationId, terminalStatus };
        }
      }
      if (Date.now() + 3_000 >= deadline) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
    }
    return { ...accepted, operationId };
  }

  private async verifyNativeCompactionUsage(
    transport: ZCodeAppServerTransport,
    sessionId: string,
    usageBefore: Record<string, unknown>,
  ): Promise<Pick<ZCodeCompactionReadback, 'completed' | 'tokenUsageObserved'>> {
    try {
      const snapshot = asRecordValue(await transport.request('session/read', { sessionId }));
      const usageAfter = asRecordValue(await transport.request('session/usage', { sessionId }));
      const beforeTokens = usageBefore['totalTokens'];
      const afterTokens = usageAfter['totalTokens'];
      const completed = asRecordValue(snapshot['session'])['sessionId'] === sessionId;
      return {
        completed,
        tokenUsageObserved: completed
          && typeof beforeTokens === 'number' && typeof afterTokens === 'number'
          && afterTokens > beforeTokens,
      };
    } catch {
      return { completed: false, tokenUsageObserved: false };
    }
  }

  /**
   * Activate a native session in the owned process (`session/resume`, proven
   * idempotent). Resume failures (e.g. unknown session) propagate unchanged.
   */
  private async ensureSessionActive(transport: ZCodeAppServerTransport, sessionId: string): Promise<void> {
    // `session/resume` is the authoritative catalog boundary for restored
    // sessions.  The following `session/read` projection intentionally
    // contains only the current model, so dropping the resume snapshot here
    // makes a restored ZCode selector appear to have one model even when the
    // runtime exposed the full provider catalog.
    const snapshot = await transport.request('session/resume', { sessionId });
    this.modelSurface.captureCatalogSnapshot(snapshot, true);
  }

  // -------------------------------------------------------------------------
  // Questions & permissions (AgentQuestionCapability / AgentPermissionCapability)
  // -------------------------------------------------------------------------

  /** Pending question asks for the existing question surface. */
  async getPendingQuestions(): Promise<QuestionRequest[]> { return this.interactions.getPending('user-input') as QuestionRequest[]; }

  /** Answer a pending question exactly once (stale/duplicate responses raise). */
  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> { this.interactions.replyToQuestion(requestID, answers); }

  /** Reject a pending question exactly once (native `decline`). */
  async rejectQuestion(requestID: string): Promise<void> { this.interactions.rejectQuestion(requestID); }

  /** Pending permission asks for the existing permission surface. */
  async getPendingPermissions(): Promise<PermissionRequest[]> { return this.interactions.getPending('permission') as PermissionRequest[]; }

  /** Approve/reject a pending permission exactly once (see ZCodeInteractionBridge for mapping semantics). */
  async respondToPermission(requestID: string, reply: PermissionReply, message?: string): Promise<void> { this.interactions.respondToPermission(requestID, reply, message); }

  /**
   * Bridge one native ask into the existing surfaces: normalize (unknown
   * shapes are denied/declined fail-closed), stream the request chunk into
   * the originating turn, and settle the native reply exactly once.
   */
  private handleInteractionAsk(kind: 'permission' | 'user-input', params: Record<string, unknown>): Promise<ZCodeInteractionReply> {
    return this.interactions.registerAskForAdapter(kind, params, (sessionId, chunk) => {
      const run = this.sessionRuns.get(sessionId);
      if (run && !run.closed && !run.cancelled) {
        run.chunks.push(chunk);
        run.wake?.();
        run.wake = null;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Models / thinking / modes / slash commands (delegated to ZCodeModelSurface)
  // -------------------------------------------------------------------------

  async getAvailableModels(): Promise<ZCodeModelCatalog['models']> {
    return this.modelSurface.getAvailableModels();
  }

  getObservedModel(): { provider: string; model: string } | null {
    const current = this.modelSurface.getAvailableModelCatalog()?.currentModel;
    return current ? { provider: current.providerId, model: current.modelId } : null;
  }
  getSlashCommands(): readonly ZCodeSlashCommandEntry[] {
    return this.modelSurface.getSlashCommands();
  }
  /** Persisted default model from settings (conversation overrides stay distinct). */
  getDefaultModel(): { provider: string; model: string } | null {
    return parseZCodeDefaultModel(this.options.getSettings?.() as { model?: string } | undefined);
  }

  /** Set a session's model after validating it against the live catalog (rejected before the wire). */
  async setSessionModel(sessionId: string, selection: { providerId: string; modelId: string; reasoningLevel?: string | null }): Promise<void> {
    const transport = this.requireTransport();
    await this.modelSurface.setSessionModel(transport, (sid) => this.ensureSessionActive(transport, sid), sessionId, selection);
  }

  /** Set a session's thinking level after validating it against the live catalog. */
  async setSessionThoughtLevel(sessionId: string, level: string): Promise<void> {
    const transport = this.requireTransport();
    await this.modelSurface.setSessionThoughtLevel(transport, (sid) => this.ensureSessionActive(transport, sid), sessionId, level);
  }

  /** Set a session's mode (plan/build/edit/yolo/auto) after enum validation. */
  async setSessionMode(sessionId: string, mode: string): Promise<void> {
    const transport = this.requireTransport();
    await this.modelSurface.setSessionMode(transport, (sid) => this.ensureSessionActive(transport, sid), sessionId, mode);
  }

  /** Effective mode from native snapshot plus independent plan-state events. */
  async readSessionMode(sessionId: string): Promise<string | null> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    const snapshot = asRecordValue(await transport.request('session/read', { sessionId }));
    this.modelSurface.captureCatalogSnapshot(snapshot);
    const mode = asRecordValue(asRecordValue(snapshot['settings'])['mode'])['current'];
    const baseMode = typeof mode === 'string' ? mode : null;
    if (!baseMode) return null;
    try {
      // session/read projects only the base mode. The official
      // session_mode_changed event carries the independent planEnabled flag;
      // session/events is its native readback surface. An absent or stale
      // event cannot prove plan, so retain the base-mode projection.
      const result = asRecordValue(await transport.request('session/events', { sessionId }));
      const events = Array.isArray(result['events']) ? result['events'] : [];
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = asRecordValue(events[index]);
        if (event['sessionId'] !== sessionId) continue;
        const payload = asRecordValue(event['payload']);
        if (typeof payload['planEnabled'] !== 'boolean' || typeof payload['mode'] !== 'string'
          || typeof payload['previousMode'] !== 'string'
          || typeof payload['previousPlanEnabled'] !== 'boolean') continue;
        return payload['mode'] === baseMode && payload['planEnabled'] ? 'plan' : baseMode;
      }
    } catch {
      // Older runtimes may not expose session/events; leave plan unconfirmed.
    }
    return baseMode;
  }

  /** Native context and token readback; incomplete reports stay unknown. */
  async getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null> {
    const transport = this.requireTransport();
    await this.ensureSessionActive(transport, sessionId);
    return readZCodeContextUsage(sessionId, transport);
  }

  // -------------------------------------------------------------------------
  // Event demux
  // -------------------------------------------------------------------------

  private handleSessionEvent(params: Record<string, unknown>): void {
    const event = toZCodeSessionEvent(params);
    if (!event?.sessionId) {
      return;
    }
    if (event.type === 'session.updated') {
      const payload = event.payload;
      const taskId = payload['taskId'];
      const nativeStatus = payload['status'];
      if (payload['taskKind'] === 'bash' && typeof taskId === 'string'
        && /^exec_[0-9a-f-]{36}$/.test(taskId)
        && typeof nativeStatus === 'string'
        && ['completed', 'failed', 'cancelled', 'killed', 'stopped'].includes(nativeStatus)) {
        const endings = this.backgroundTaskEndings.get(event.sessionId) ?? new Map();
        const seq = event.seq ?? 0;
        if (seq >= (endings.get(taskId)?.seq ?? -1)) {
          endings.set(taskId, {
            seq,
            task: {
              taskId,
              status: nativeStatus === 'killed' ? 'stopped' : nativeStatus,
              description: typeof payload['description'] === 'string' ? payload['description'] : '',
              cancellable: false,
            },
          });
          this.backgroundTaskEndings.set(event.sessionId, endings);
        }
      }
    }
    const run = this.sessionRuns.get(event.sessionId);
    if (!run || run.closed) {
      return;
    }
    run.queue.push(event);
    run.wake?.();
    run.wake = null;
  }

  private closeAllRuns(): void {
    for (const run of this.sessionRuns.values()) {
      run.closed = true;
      run.wake?.();
      run.wake = null;
    }
  }

  private requireTransport(): ZCodeAppServerTransport {
    if (!this.transport) {
      throw new Error('ZCode backend is not connected.');
    }
    return this.transport;
  }

  private failStart(message: string, safeDiagnostic?: string): void {
    this.lastError = safeDiagnostic ?? redactZCodeDiagnosticText(message);
    this.handshake = 'failed';
    this.setStatus('error');
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this.currentStatus === status) {
      return;
    }
    this.currentStatus = status;
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // A UI subscriber must not break adapter lifecycle propagation.
      }
    }
  }
}

/** Resolve only ZCode-qualified completion models, preserving native reasoning readback. */
function resolveZCodeInlineCompletionModel(
  requested: BackendModelSelection | undefined,
  current: ZCodeModelCatalog['currentModel'],
): { providerId: string; modelId: string; reasoningLevel?: string | null } | null {
  if (!requested) {
    return current
      ? {
          providerId: current.providerId,
          modelId: current.modelId,
          reasoningLevel: current.reasoningLevel,
        }
      : null;
  }
  if (requested.kind !== 'zcode') {
    throw new Error('ZCode inline completion requires a ZCode model selection.');
  }
  const matchesCurrent = current?.providerId === requested.provider && current.modelId === requested.model;
  return {
    providerId: requested.provider,
    modelId: requested.model,
    reasoningLevel: requested.reasoningLevel ?? (matchesCurrent ? current.reasoningLevel : undefined),
  };
}
