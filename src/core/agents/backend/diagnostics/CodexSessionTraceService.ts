/* eslint-disable max-params -- The internal emit seam intentionally keeps context, routing, and payload options in one auditable call signature. */
import { createHash, randomUUID } from 'crypto';

import { createLogger } from '../../../../shared';
import {
  resolveDefaultTraceDirectory,
  TraceRedactor,
  TraceReportBuilder,
  type TraceSeverity,
  TraceStore,
  type TraceTerminalState,
} from '../../../../shared/diagnostics';
import { CodexTraceRingBuffer } from './CodexTraceRingBuffer';
import { CodexWireTraceBridge } from './CodexWireTraceBridge';
import {
  CODEX_TRACE_SCHEMA_VERSION,
  type CodexDiagnosticRunToken,
  type CodexSessionTraceSettings,
  type CodexTraceChannelId,
  type CodexTraceContext,
  type CodexTraceEventV1,
  type CodexTracePort,
  type CodexTraceSource,
  type CodexWireRecord,
} from './types';

const logger = createLogger('CodexTrace');
const ARM_TTL_MS = 30 * 60 * 1000;
const TURN_WARNING_MS = 60 * 1000;
const TURN_CRITICAL_MS = 180 * 1000;

export interface CodexSessionTraceServiceOptions {
  settings: () => CodexSessionTraceSettings;
  vaultPath?: string;
  buildIdentity?: () => string;
  knownSecrets?: () => readonly string[];
  runtimeMetadata?: () => Record<string, unknown>;
}

interface ArmedCapture {
  token: CodexDiagnosticRunToken;
  threadId?: string;
}

interface ActiveTurnState {
  context: CodexTraceContext;
  warningTimer: ReturnType<typeof setTimeout>;
  criticalTimer: ReturnType<typeof setTimeout>;
  flushedAtWarning: boolean;
  finished: boolean;
}

export class CodexSessionTraceService implements CodexTracePort {
  readonly runtimeSegmentId = randomUUID();
  readonly store: TraceStore<CodexTraceEventV1>;
  readonly reportBuilder: TraceReportBuilder<CodexTraceEventV1>;
  readonly wireBridge: CodexWireTraceBridge;
  private readonly redactor: TraceRedactor;
  private readonly ringBuffer = new CodexTraceRingBuffer();
  private sequence = 0;
  private readonly armedByTab = new Map<string, ArmedCapture>();
  private readonly claimedByTab = new Map<string, CodexDiagnosticRunToken>();
  private readonly threadContextById = new Map<string, CodexTraceContext>();
  private readonly activeTurnsByThread = new Map<string, ActiveTurnState>();
  /** Turn identities that have emitted their terminal event. */
  private readonly finishedTurnKeys = new Set<string>();

  constructor(private readonly options: CodexSessionTraceServiceOptions) {
    const storageDirectory = options.settings().storageDirectory.trim();
    this.store = new TraceStore<CodexTraceEventV1>(
      storageDirectory || undefined,
      resolveDefaultTraceDirectory('codex'),
      // Codex has no `run.started` event — its run analog is `turn.started`.
      // Inject the name so the store's runCount/deepCaptureCount counters
      // reflect Codex turns instead of staying permanently zero.
      {
        bundlePrefix: 'codex-trace',
        runStartEventName: 'turn.started',
        disabled: !options.settings().enabled,
        sanitizeExport: (content) => this.redactExportContent(content),
      },
    );
    this.redactor = new TraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets,
      redactionMode: 'hardened',
    });
    this.reportBuilder = new TraceReportBuilder<CodexTraceEventV1>(
      this.store,
      options.buildIdentity ?? (() => 'Build: unknown'),
      this.redactor,
      { title: 'OpenCodian Codex Session Trace', extractMetadata: extractCodexTraceMetadata },
    );
    this.wireBridge = new CodexWireTraceBridge(this);
    this.store.onDegraded((error) => {
      this.emit(this.runtimeContext(), 'lifecycle', 'storage', 'critical', 'trace.storage_degraded', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.started', {
      runtimeSegmentId: this.runtimeSegmentId,
      platform: process.platform,
      storageDirectory: this.store.rootDirectory,
      ...options.runtimeMetadata?.(),
    });
  }

  // ---- CodexTracePort ----

  bindThread(input: { threadId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'app-server' | 'sdk'; payload?: unknown }): CodexTraceContext {
    const previousTraceId = this.store.resolveTraceId(input.threadId);
    const context: CodexTraceContext = {
      traceId: previousTraceId ?? this.stableTraceId(input.threadId),
      runtimeSegmentId: this.runtimeSegmentId,
      threadId: input.threadId,
      conversationId: input.conversationId,
      tabId: input.tabId,
    };
    if (!this.isEnabled()) return context;
    this.store.bindSession(input.threadId, context.traceId);
    this.threadContextById.set(input.threadId, context);
    this.emit(context, 'lifecycle', 'plugin', 'info', input.resumed || previousTraceId ? 'thread.resumed' : 'thread.bound', {
      provisionalId: input.provisionalId,
      via: input.via,
      ...((input.payload as Record<string, unknown> | undefined) ?? {}),
    });
    return context;
  }

  beginTurn(input: { threadId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: CodexDiagnosticRunToken; payload?: unknown }): CodexTraceContext {
    const bound = this.threadContextById.get(input.threadId) ?? this.bindThread({ threadId: input.threadId, resumed: true, via: 'app-server' });
    if (!this.isEnabled()) {
      return {
        ...bound,
        conversationId: input.conversationId ?? bound.conversationId,
        tabId: input.tabId ?? bound.tabId,
        turnId: input.turnId,
      };
    }
    const token = input.diagnosticRunToken;
    const deepCapture = this.isActiveDeepCaptureToken(token);
    const context: CodexTraceContext = {
      ...bound,
      conversationId: input.conversationId ?? bound.conversationId,
      tabId: input.tabId ?? bound.tabId ?? token?.tabId,
      turnId: input.turnId,
      runId: deepCapture ? token?.runId : undefined,
      deepCapture,
    };
    this.finishedTurnKeys.delete(this.turnKey(context));
    this.emit(context, 'lifecycle', 'plugin', 'info', 'turn.started', { model: input.model, deepCapture, ...(input.payload as Record<string, unknown> | undefined) });
    this.armTurnWatchdog(context);
    // I5: the `turn/start` RPC is sent BEFORE beginTurn is called (the turnId
    // is only known once startTurn returns), so that request/response lands
    // only in the ring buffer. When a claimed deep-capture token is active,
    // retroactively flush the ring buffer into this deep run so the most
    // important prompt enters the capture instead of being lost.
    if (deepCapture) {
      this.flushRingBufferIntoRun(input.threadId, token!.runId, 'turn-start-deep', context);
    }
    return context;
  }

  recordTurnNotification(context: CodexTraceContext, method: string, payload?: unknown): void {
    if (!this.isEnabled()) {
      this.clearTurnForContext(context);
      return;
    }
    this.resetTurnWatchdog(context.threadId);
    const turn = this.activeTurnsByThread.get(context.threadId ?? '');
    this.emit(context, 'stream-sync', 'app-server', 'debug', 'turn.notification', this.summarize(payload), { metrics: { bytes: byteLength(payload) } });
    if (method === 'turn/completed' && turn && !turn.finished) {
      const errorText = readTurnError(payload);
      this.finishTurn(context, errorText ? 'error' : 'completed', errorText ? { error: errorText } : undefined);
    }
  }

  recordStreamSync(context: CodexTraceContext | undefined, name: string, severity: 'debug' | 'info' | 'warning', payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'stream-sync', 'plugin', severity, name, this.summarize(payload));
  }

  recordToolInteraction(context: CodexTraceContext | undefined, name: string, payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'tool-interaction', 'plugin', 'info', name, payload);
  }

  recordLifecycle(name: string, payload?: unknown): void {
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', name, payload);
  }

  recordServiceOutput(stream: 'stdout' | 'stderr', text: string): void {
    this.emit(this.runtimeContext(), 'service-output', 'cli', stream === 'stderr' ? 'warning' : 'debug', 'service.output', text);
  }

  shouldCaptureServiceOutput(): boolean {
    return this.isEnabled();
  }

  recordWireEvent(record: CodexWireRecord): void {
    if (!this.isEnabled()) {
      this.clearActiveTurn(record.threadId);
      return;
    }
    this.ringBuffer.record(record.threadId, { recordedAt: Date.now(), record });
    if (record.kind === 'notification') this.resetTurnWatchdog(record.threadId);
    if (record.kind === 'connection' && (record.method === 'closed' || record.method === 'error')) {
      this.failActiveTurns(record.method === 'closed' ? 'transport.closed' : 'transport.error');
    }
    if (record.kind === 'response' && record.ok === false) {
      this.markAnomaly(this.contextForWire(record), 'wire.response_error', 'error', { requestId: record.requestId, error: record.payload });
      if (record.threadId) this.flushRingBuffer(record.threadId, 'response-error');
    }
    const context = this.contextForWire(record);
    const deep = this.isActiveDeepCaptureContext(context);
    const name = `wire.${record.kind}`;
    const envelope: Record<string, unknown> = {
      direction: record.direction,
      method: record.method,
      requestId: record.requestId,
      ok: record.ok,
      bytes: record.bytes,
    };
    const deepPayload = deep && this.options.settings().captureContent ? record.payload : undefined;
    this.emit(context, 'transport', 'app-server', record.ok === false ? 'warning' : 'debug', name, deep ? deepPayload ?? this.summarize(record.payload) : envelope, {
      metrics: { bytes: record.bytes, ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}) },
      forceDeep: deep,
    });
  }

  finishTurn(context: CodexTraceContext, state: TraceTerminalState, payload?: unknown): void {
    if (!this.isEnabled()) {
      this.clearTurnForContext(context);
      return;
    }
    const threadId = context.threadId ?? '';
    const deepCapture = this.isActiveDeepCaptureContext(context);
    const turn = this.activeTurnsByThread.get(threadId);
    if (turn && this.sameTurn(turn.context, context)) this.clearTurnForContext(context);
    // I1 idempotency: once a turn has emitted `turn.finished`, subsequent
    // calls (e.g. the adapter's explicit finishTurn after the auto-finish on
    // `turn/completed`) still clear timers/claims and remove state, but MUST
    // NOT emit a second `turn.finished` event — that would double-count runs /
    // deep captures in the report and catalog.
    const turnKey = this.turnKey(context);
    if (this.finishedTurnKeys.has(turnKey)) {
      return;
    }
    this.finishedTurnKeys.add(turnKey);
    this.emit(context, 'lifecycle', 'plugin', state === 'completed' ? 'info' : state === 'cancelled' ? 'info' : 'warning', 'turn.finished', { state, ...(payload as Record<string, unknown> | undefined) }, { forceDeep: deepCapture });
    if (state === 'error' || state === 'incomplete') {
      this.flushRingBuffer(context.threadId, `turn-${state}`);
    }
  }

  markAnomaly(context: CodexTraceContext | undefined, name: string, severity: 'warning' | 'critical' | 'error', payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'lifecycle', 'plugin', severity, name, payload);
  }

  armDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken {
    if (!this.isEnabled()) {
      const armedAt = Date.now();
      return { runId: randomUUID(), tabId, armedAt, expiresAt: armedAt };
    }
    const token: CodexDiagnosticRunToken = { runId: randomUUID(), tabId, armedAt: Date.now(), expiresAt: Date.now() + ARM_TTL_MS };
    this.armedByTab.set(tabId, { token, threadId });
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.armed', { tabId, threadId, expiresAt: new Date(token.expiresAt).toISOString() });
    return token;
  }

  cancelDeepCapture(tabId: string): boolean {
    const existed = this.clearCaptureForTab(tabId);
    if (!this.isEnabled()) return existed;
    if (existed) this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.cancelled', { tabId });
    return existed;
  }

  claimDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken | undefined {
    if (!this.isEnabled()) {
      this.clearCaptureForTab(tabId);
      return undefined;
    }
    const armed = this.armedByTab.get(tabId);
    if (!armed || armed.token.expiresAt <= Date.now()) return undefined;
    if (armed.threadId && threadId && armed.threadId !== threadId) return undefined;
    this.armedByTab.delete(tabId);
    this.claimedByTab.set(tabId, armed.token);
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.claimed', { tabId, threadId, runId: armed.token.runId });
    return armed.token;
  }

  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing' {
    if (!this.isEnabled()) {
      this.clearCaptureForTab(tabId);
      return 'off';
    }
    const claimed = this.claimedByTab.get(tabId);
    if (claimed) {
      // I4: a claimed token must still honor its TTL; an expired claim is
      // reaped here and reported as 'off' so the chrome does not show a
      // stale 'capturing' state.
      if (claimed.expiresAt > Date.now()) return 'capturing';
      this.claimedByTab.delete(tabId);
    }
    const armed = this.armedByTab.get(tabId);
    return armed && armed.token.expiresAt > Date.now() ? 'armed' : 'off';
  }

  flushRingBuffer(threadId: string | undefined, reason: string): void {
    if (!this.isEnabled()) return;
    this.flushRingBufferIntoRun(threadId, `retro-${randomUUID()}`, reason);
  }

  /**
   * Drains the ring buffer for a thread and emits each entry as a deep
   * `wire.retroactive` event bound to `runId`. Used both for ad-hoc flushes
   * (manual export / error flush → synthetic retro run) and, when a claimed
   * deep-capture token is active, to fold the already-seen `turn/start`
   * request/response into the live deep run.
   */
  private flushRingBufferIntoRun(threadId: string | undefined, runId: string, reason: string, context = this.contextForThreadId(threadId)): void {
    const entries = this.ringBuffer.drain(threadId);
    if (entries.length === 0) return;
    const captureContent = this.options.settings().captureContent;
    for (const entry of entries) {
      const payload = captureContent ? entry.record.payload : this.summarize(entry.record.payload);
      this.emit({ ...context, runId }, 'transport', 'app-server', 'info', 'wire.retroactive', { reason, recordedAt: new Date(entry.recordedAt).toISOString(), envelope: { direction: entry.record.direction, kind: entry.record.kind, method: entry.record.method, requestId: entry.record.requestId, bytes: entry.record.bytes }, payload }, { forceDeep: true, runId });
    }
  }

  async dispose(): Promise<void> {
    for (const turn of this.activeTurnsByThread.values()) this.clearTurnWatchdog(turn);
    this.activeTurnsByThread.clear();
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.stopped', { runtimeSegmentId: this.runtimeSegmentId });
    await this.store.dispose();
  }

  // ---- internals ----

  private runtimeContext(): CodexTraceContext {
    return { traceId: this.runtimeSegmentId, runtimeSegmentId: this.runtimeSegmentId };
  }

  private contextForThreadId(threadId: string | undefined): CodexTraceContext {
    if (!threadId) return this.runtimeContext();
    return this.threadContextById.get(threadId) ?? { ...this.runtimeContext(), traceId: this.stableTraceId(threadId), threadId };
  }

  private contextForWire(record: CodexWireRecord): CodexTraceContext {
    const threadContext = this.contextForThreadId(record.threadId);
    const turn = record.threadId ? this.activeTurnsByThread.get(record.threadId) : undefined;
    return turn ? turn.context : threadContext;
  }

  private stableTraceId(threadId: string): string {
    return `trace-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`;
  }

  private armTurnWatchdog(context: CodexTraceContext): void {
    const threadId = context.threadId ?? '';
    const existing = this.activeTurnsByThread.get(threadId);
    if (existing) this.clearTurnWatchdog(existing);
    const state: ActiveTurnState = {
      context,
      flushedAtWarning: false,
      finished: false,
      warningTimer: setTimeout(() => this.onTurnSilent(threadId, 'warning'), TURN_WARNING_MS),
      criticalTimer: setTimeout(() => this.onTurnSilent(threadId, 'critical'), TURN_CRITICAL_MS),
    };
    this.activeTurnsByThread.set(threadId, state);
  }

  private resetTurnWatchdog(threadId: string | undefined): void {
    if (!threadId) return;
    const turn = this.activeTurnsByThread.get(threadId);
    if (!turn || turn.finished) return;
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
    turn.warningTimer = setTimeout(() => this.onTurnSilent(threadId, 'warning'), TURN_WARNING_MS);
    turn.criticalTimer = setTimeout(() => this.onTurnSilent(threadId, 'critical'), TURN_CRITICAL_MS);
  }

  private clearTurnWatchdog(turn: ActiveTurnState): void {
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
  }

  private clearActiveTurn(threadId: string | undefined): void {
    if (!threadId) return;
    const turn = this.activeTurnsByThread.get(threadId);
    if (turn) this.clearTurnForContext(turn.context);
  }

  private clearTurnForContext(context: CodexTraceContext): void {
    const threadId = context.threadId ?? '';
    const turn = this.activeTurnsByThread.get(threadId);
    if (turn && this.sameTurn(turn.context, context)) {
      turn.finished = true;
      this.clearTurnWatchdog(turn);
      this.activeTurnsByThread.delete(threadId);
    }
    if (context.tabId) {
      const claimed = this.claimedByTab.get(context.tabId);
      if (!claimed || !context.runId || claimed.runId === context.runId) this.claimedByTab.delete(context.tabId);
    }
  }

  private sameTurn(left: CodexTraceContext, right: CodexTraceContext): boolean {
    if (left === right) return true;
    if (left.threadId !== right.threadId) return false;
    if (left.turnId || right.turnId) return Boolean(left.turnId && right.turnId && left.turnId === right.turnId);
    if (left.runId || right.runId) return Boolean(left.runId && right.runId && left.runId === right.runId);
    return false;
  }

  private turnKey(context: CodexTraceContext): string {
    return `${context.threadId ?? ''}:${context.turnId ?? context.runId ?? 'unidentified'}`;
  }

  private onTurnSilent(threadId: string, level: 'warning' | 'critical'): void {
    const turn = this.activeTurnsByThread.get(threadId);
    if (!turn || turn.finished) return;
    if (!this.isEnabled()) {
      this.clearTurnForContext(turn.context);
      return;
    }
    const silentMs = level === 'warning' ? TURN_WARNING_MS : TURN_CRITICAL_MS;
    this.markAnomaly(turn.context, 'turn.stalled', level, { threadId, silentMs });
    if (level === 'warning' && !turn.flushedAtWarning) {
      turn.flushedAtWarning = true;
      this.flushRingBuffer(threadId, 'watchdog-warning');
    }
    if (level === 'critical') {
      this.finishTurn(turn.context, 'incomplete', { reason: 'watchdog-critical', silentMs });
    }
  }

  private failActiveTurns(reason: string): void {
    for (const [threadId, turn] of [...this.activeTurnsByThread]) {
      this.markAnomaly(turn.context, reason, 'error', { threadId });
      this.finishTurn(turn.context, 'error', { reason });
    }
  }

  private summarize(payload: unknown): unknown {
    if (payload === undefined || payload === null) return undefined;
    if (Array.isArray(payload)) return { type: 'array', length: payload.length };
    if (typeof payload === 'object') return { type: 'object', keys: Object.keys(payload as Record<string, unknown>).slice(0, 40) };
    if (typeof payload === 'string') return { type: 'string', length: payload.length };
    return { type: typeof payload };
  }

  private redactionMetrics(stats: { secretsRemoved: number; pathsNormalized: number; valuesTruncated: number }): Record<string, number> {
    return { redactedSecrets: stats.secretsRemoved, normalizedPaths: stats.pathsNormalized, truncatedValues: stats.valuesTruncated };
  }

  private emit(
    context: CodexTraceContext,
    channel: CodexTraceChannelId,
    source: CodexTraceSource,
    severity: TraceSeverity,
    name: string,
    payload?: unknown,
    options?: { metrics?: Record<string, number>; forceDeep?: boolean; runId?: string },
  ): void {
    try {
      if (!this.isEnabled()) return;
      this.store.enable();
      const redacted = payload === undefined ? undefined : this.redactor.redact(payload, channel === 'service-output' ? 'service-output' : 'ordinary');
      const deep = options?.forceDeep ?? this.isActiveDeepCaptureContext(context);
      const event: CodexTraceEventV1 = {
        schemaVersion: CODEX_TRACE_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        monotonicSequence: ++this.sequence,
        traceId: context.traceId,
        runtimeSegmentId: context.runtimeSegmentId,
        runId: options?.runId ?? context.runId,
        sessionId: context.threadId,
        turnId: context.turnId,
        channel,
        source,
        severity,
        name,
        metrics: { ...(redacted ? this.redactionMetrics(redacted.stats) : {}), ...options?.metrics },
        payload: redacted?.value,
        payloadRef: { kind: deep ? 'deep' : 'inline', runId: options?.runId ?? context.runId },
      };
      this.store.append(event, deep);
      this.mirrorToConsole(event);
    } catch {
      // Diagnostics must never affect the Codex chat request or stream path.
    }
  }

  private mirrorToConsole(event: CodexTraceEventV1): void {
    try {
      const settings = this.options.settings();
      const always = event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error';
      if (!always && settings.consolePreset !== 'full') return;
      if (!always && !settings.consoleChannels[event.channel]) return;
      const line = `[codex-trace] ${event.severity} ${event.channel}/${event.name}`;
      if (always) logger.warn(line, event.payload ?? '');
      else logger.debug(line, event.payload ?? '');
    } catch {
      // Console failure is diagnostics-only.
    }
  }

  private isEnabled(): boolean {
    return this.options.settings().enabled;
  }

  private clearCaptureForTab(tabId: string): boolean {
    const armed = this.armedByTab.delete(tabId);
    const claimed = this.claimedByTab.delete(tabId);
    return armed || claimed;
  }

  private isActiveDeepCaptureToken(token: CodexDiagnosticRunToken | undefined): boolean {
    if (!token || token.expiresAt <= Date.now()) return false;
    const claimed = this.claimedByTab.get(token.tabId);
    return claimed?.runId === token.runId;
  }

  private isActiveDeepCaptureContext(context: CodexTraceContext): boolean {
    if (!context.deepCapture || !context.tabId || !context.runId) return false;
    const claimed = this.claimedByTab.get(context.tabId);
    if (claimed?.runId === context.runId && claimed.expiresAt > Date.now()) return true;
    if (claimed?.runId === context.runId) this.claimedByTab.delete(context.tabId);
    context.deepCapture = false;
    return false;
  }

  private redactExportContent(content: string): string {
    return content.split('\n').map((line) => {
      if (!line) return line;
      try {
        return JSON.stringify(this.redactor.redact(JSON.parse(line)).value);
      } catch {
        const redacted = this.redactor.redact(line).value;
        return typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
      }
    }).join('\n');
  }
}

function byteLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return 0;
  }
}

function readTurnError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const params = payload as { turn?: { error?: unknown }; error?: unknown };
  const candidate = params.turn?.error ?? params.error;
  if (!candidate) return undefined;
  if (typeof candidate === 'string') return candidate;
  if (typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string') {
    return (candidate as { message: string }).message;
  }
  return 'unknown turn error';
}

function extractCodexTraceMetadata(events: CodexTraceEventV1[]): string[] {
  const threads = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const turns = new Set(events.map((event) => event.turnId).filter(Boolean));
  const retro = events.filter((event) => event.name === 'wire.retroactive').length;
  const stalls = events.filter((event) => event.name === 'turn.stalled').length;
  const redactedSecrets = events.reduce((sum, event) => sum + (event.metrics?.redactedSecrets ?? 0), 0);
  return [
    `Threads: ${threads.size}`,
    `Turns: ${turns.size}`,
    `Retroactive wire events: ${retro}`,
    `Stall anomalies: ${stalls}`,
    `Redacted secrets: ${redactedSecrets}`,
  ];
}
