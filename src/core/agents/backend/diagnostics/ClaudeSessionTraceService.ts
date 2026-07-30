/* eslint-disable max-lines -- This service intentionally keeps the Claude trace lifecycle, watchdog, and export safety boundary together. */
import { randomUUID } from 'crypto';

import { createLogger } from '../../../../shared';
import {
  resolveDefaultTraceDirectory,
  TraceRedactor,
  TraceReportBuilder,
  type TraceSeverity,
  TraceStore,
  type TraceStoreStatus,
  type TraceSummary,
  type TraceTerminalState,
} from '../../../../shared/diagnostics';
import { ClaudeTraceRingBuffer } from './ClaudeTraceRingBuffer';
import {
  CLAUDE_TRACE_SCHEMA_VERSION,
  type ClaudeDiagnosticRunToken,
  type ClaudeSdkTraceRecord,
  type ClaudeSessionTraceSettings,
  type ClaudeTraceChannelId,
  type ClaudeTraceContext,
  type ClaudeTraceEventV1,
  type ClaudeTracePort,
  type ClaudeTraceSource,
} from './types';

const logger = createLogger('ClaudeTrace');
const ARM_TTL_MS = 30 * 60 * 1000;
const TURN_WARNING_MS = 60 * 1000;
const TURN_CRITICAL_MS = 180 * 1000;
const MAX_DEFERRED_EVENTS = 4096;
const MAX_DEFERRED_BYTES = 5 * 1024 * 1024;

export interface ClaudeSessionTraceServiceOptions {
  settings: () => ClaudeSessionTraceSettings;
  vaultPath?: string;
  buildIdentity?: () => string;
  /** Must be a getter so edits to Claude credentials take effect immediately. */
  knownSecrets?: () => readonly string[];
  runtimeMetadata?: () => Record<string, unknown>;
}

interface ArmedCapture {
  token: ClaudeDiagnosticRunToken;
  sessionId?: string;
}

interface ActiveTurnState {
  context: ClaudeTraceContext;
  warningTimer: ReturnType<typeof setTimeout> | undefined;
  criticalTimer: ReturnType<typeof setTimeout> | undefined;
  lastActivityAt: number;
  flushedAtWarning: boolean;
  finished: boolean;
  /** A new local chat stays memory-only until the SDK supplies its durable id. */
  started: boolean;
  startPayload?: Record<string, unknown>;
  /** Already-redacted structural/deep events awaiting the SDK session binding. */
  deferredEvents: Array<{ event: ClaudeTraceEventV1; deep: boolean }>;
  deferredBytes: number;
  deferredDropped: number;
}

/**
 * Claude's safe diagnostics port. Every public operation is a best-effort
 * boundary: a diagnostics failure is deliberately unable to alter a chat run.
 */
export class ClaudeSessionTraceService implements ClaudeTracePort {
  readonly runtimeSegmentId = randomUUID();
  readonly store: TraceStore<ClaudeTraceEventV1>;
  readonly reportBuilder: TraceReportBuilder<ClaudeTraceEventV1>;
  private readonly redactor: TraceRedactor;
  private readonly ringBuffer = new ClaudeTraceRingBuffer();
  private sequence = 0;
  private readonly armedByTab = new Map<string, ArmedCapture>();
  private readonly claimedByTab = new Map<string, ClaudeDiagnosticRunToken>();
  private readonly captureExpiryTimersByTab = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sessionContextById = new Map<string, ClaudeTraceContext>();
  private readonly activeTurnsBySession = new Map<string, ActiveTurnState>();
  private readonly finishedTurnKeys = new Set<string>();

  constructor(private readonly options: ClaudeSessionTraceServiceOptions) {
    const storageDirectory = this.settings().storageDirectory.trim();
    this.store = new TraceStore<ClaudeTraceEventV1>(
      storageDirectory || undefined,
      resolveDefaultTraceDirectory('claude'),
      {
        bundlePrefix: 'claude-trace',
        runStartEventName: 'turn.started',
        disabled: !this.isEnabled(),
        sanitizeExport: (content) => this.redactExportContent(content),
      },
    );
    this.redactor = new TraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets,
      redactionMode: 'hardened',
    });
    this.reportBuilder = new TraceReportBuilder<ClaudeTraceEventV1>(
      this.store,
      options.buildIdentity ?? (() => 'Build: unknown'),
      this.redactor,
      { title: 'OpenCodian Claude Code Session Trace', extractMetadata: extractClaudeTraceMetadata },
    );
    this.store.onDegraded((error) => {
      this.emit(this.runtimeContext(), 'lifecycle', 'storage', 'critical', 'trace.storage_degraded', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.started', {
      runtimeSegmentId: this.runtimeSegmentId,
      platform: process.platform,
      storageDirectory: this.store.rootDirectory,
      ...this.runtimeMetadata(),
    });
  }

  bindSession(input: { sessionId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'sdk' | 'cli'; payload?: unknown }): ClaudeTraceContext {
    try {
      const sessionId = input.sessionId.trim();
      const previousTraceId = this.store.resolveTraceId(sessionId);
      const provisional = input.provisionalId
        ? this.sessionContextById.get(input.provisionalId)
        : undefined;
      const context: ClaudeTraceContext = provisional ?? {
        traceId: previousTraceId ?? sessionId,
        runtimeSegmentId: this.runtimeSegmentId,
        sessionId,
        conversationId: input.conversationId,
        tabId: input.tabId,
      };
      const pendingTurn = input.provisionalId
        ? this.activeTurnsBySession.get(input.provisionalId)
        : undefined;
      if (provisional) {
        provisional.traceId = previousTraceId ?? sessionId;
        provisional.sessionId = sessionId;
        provisional.conversationId ??= input.conversationId;
        provisional.tabId ??= input.tabId;
        this.sessionContextById.delete(input.provisionalId!);
      }
      if (pendingTurn && input.provisionalId) {
        this.activeTurnsBySession.delete(input.provisionalId);
        pendingTurn.context = context;
        this.activeTurnsBySession.set(sessionId, pendingTurn);
        this.migrateRingBuffer(input.provisionalId, sessionId);
        this.rebindTurnWatchdog(sessionId, pendingTurn);
      }
      if (!this.isEnabled()) return context;
      this.store.bindSession(sessionId, context.traceId);
      this.sessionContextById.set(sessionId, context);
      if (pendingTurn && !pendingTurn.started) {
        pendingTurn.started = true;
        this.emit(context, 'lifecycle', 'plugin', 'info', input.resumed || previousTraceId ? 'session.resumed' : 'session.bound', {
          provisionalId: input.provisionalId,
          via: input.via,
          ...asRecord(input.payload),
        });
        this.emitTurnStarted(context, pendingTurn.startPayload);
        this.flushDeferredEvents(pendingTurn, context);
      } else {
        this.emit(context, 'lifecycle', 'plugin', 'info', input.resumed || previousTraceId ? 'session.resumed' : 'session.bound', {
          provisionalId: input.provisionalId,
          via: input.via,
          ...asRecord(input.payload),
        });
      }
      return context;
    } catch {
      return this.runtimeContext();
    }
  }

  beginTurn(input: { sessionId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: ClaudeDiagnosticRunToken; payload?: unknown; provisional?: boolean }): ClaudeTraceContext {
    try {
      const sessionId = input.sessionId.trim();
      const provisional = input.provisional === true;
      const bound = this.sessionContextById.get(sessionId)
        ?? (provisional
          ? {
              traceId: `provisional-${randomUUID()}`,
              runtimeSegmentId: this.runtimeSegmentId,
              sessionId,
              conversationId: input.conversationId,
              tabId: input.tabId,
            }
          : this.bindSession({ sessionId, resumed: true, via: 'sdk' }));
      const token = input.diagnosticRunToken;
      const deepCapture = this.isActiveDeepCaptureToken(token);
      const context: ClaudeTraceContext = {
        ...bound,
        sessionId,
        conversationId: input.conversationId ?? bound.conversationId,
        tabId: input.tabId ?? bound.tabId ?? token?.tabId,
        turnId: input.turnId ?? randomUUID(),
        runId: deepCapture ? token?.runId : undefined,
        deepCapture,
      };
      if (!this.isEnabled()) return context;
      if (provisional) this.sessionContextById.set(sessionId, context);
      this.finishedTurnKeys.delete(this.turnKey(context));
      const startPayload = {
        model: input.model,
        deepCapture,
        ...asRecord(input.payload),
      };
      if (!provisional) this.emitTurnStarted(context, startPayload);
      this.armTurnWatchdog(context, !provisional, startPayload);
      if (deepCapture && token) {
        this.flushRingBufferIntoRun(sessionId, token.runId, 'turn-start-deep', context);
      }
      return context;
    } catch {
      return this.runtimeContext();
    }
  }

  recordSdkMessage(context: ClaudeTraceContext | undefined, message: unknown): void {
    try {
      if (!this.isEnabled()) {
        this.clearTurnForContext(context);
        return;
      }
      const current = context ?? this.runtimeContext();
      const record = sdkRecord(message, this.redactor);
      this.ringBuffer.record(current.sessionId, { recordedAt: Date.now(), record });
      this.resetTurnWatchdog(current.sessionId);
      const deep = this.isActiveDeepCaptureContext(current);
      this.emit(current, 'stream-sync', 'sdk', isSdkError(message) ? 'warning' : 'debug', `sdk.message.${record.type}`, deep ? record.payload : sdkEnvelope(record), {
        metrics: { bytes: record.bytes },
        forceDeep: deep,
        messageUuid: record.uuid,
        partId: record.partId,
        toolUseId: record.toolUseId,
      });
      if (isSdkError(message)) {
        this.emit(current, 'lifecycle', 'sdk', 'error', 'turn.error_evidence', sdkEnvelope(record), {
          metrics: { bytes: record.bytes },
          messageUuid: record.uuid,
          partId: record.partId,
          toolUseId: record.toolUseId,
        });
        this.flushRingBuffer(current.sessionId, 'sdk-error');
      }
    } catch {
      // Trace collection must not affect SDK iteration.
    }
  }

  recordNormalizedChunk(context: ClaudeTraceContext | undefined, chunkType: string, chunk?: unknown): void {
    try {
      if (!this.isEnabled()) {
        this.clearTurnForContext(context);
        return;
      }
      const current = context ?? this.runtimeContext();
      this.resetTurnWatchdog(current.sessionId);
      const identifiers = identifiersFrom(chunk);
      const deep = this.isActiveDeepCaptureContext(current);
      this.emit(current, 'stream-sync', 'plugin', chunkType === 'error' ? 'warning' : 'debug', `stream.chunk.${safeName(chunkType)}`, deep ? chunk : chunkEnvelope(chunkType, chunk, identifiers), {
        forceDeep: deep,
        messageUuid: identifiers.messageUuid,
        partId: identifiers.partId,
        toolUseId: identifiers.toolUseId,
      });
      if (chunkType === 'error') this.flushRingBuffer(current.sessionId, 'normalized-error');
    } catch {
      // Trace collection must not affect normalizer output.
    }
  }

  recordTurnEvent(context: ClaudeTraceContext | undefined, name: string, severity: TraceSeverity = 'info', payload?: unknown): void {
    try {
      const current = context ?? this.runtimeContext();
      if (!this.isEnabled()) {
        this.clearTurnForContext(current);
        return;
      }
      this.emit(current, 'lifecycle', 'plugin', severity, safeName(name), payload, {
        forceDeep: this.isActiveDeepCaptureContext(current),
      });
      if (severity === 'error' || safeName(name) === 'turn.send_failed') {
        this.flushRingBuffer(current.sessionId, 'turn-event-error');
      }
    } catch {
      // Trace collection must not affect the send lifecycle.
    }
  }

  finishTurn(context: ClaudeTraceContext, state: TraceTerminalState, payload?: unknown): void {
    try {
      this.finishTurnInternal(context, state, payload);
    } catch {
      // Trace collection must not affect stream finalization.
    }
  }

  recordLifecycle(name: string, payload?: unknown): void {
    try {
      this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', safeName(name), payload);
    } catch {
      // Diagnostics-only operation.
    }
  }

  recordPermission(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void {
    try {
      const current = context ?? this.runtimeContext();
      this.emit(current, 'tool-interaction', 'plugin', 'info', prefixedName('permission', operation), payload, {
        forceDeep: this.isActiveDeepCaptureContext(current),
      });
    } catch {
      // Permission handling must remain independent from diagnostics.
    }
  }

  recordElicitation(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void {
    try {
      const current = context ?? this.runtimeContext();
      this.emit(current, 'tool-interaction', 'plugin', 'info', prefixedName('elicitation', operation), payload, {
        forceDeep: this.isActiveDeepCaptureContext(current),
      });
    } catch {
      // Elicitation handling must remain independent from diagnostics.
    }
  }

  recordPersistence(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void {
    try {
      const current = context ?? this.runtimeContext();
      this.emit(current, 'persistence-recovery', 'plugin', 'info', prefixedName('persistence', operation), payload, {
        forceDeep: this.isActiveDeepCaptureContext(current),
      });
    } catch {
      // Persistence handling must remain independent from diagnostics.
    }
  }

  armDeepCapture(tabId: string, sessionId?: string): ClaudeDiagnosticRunToken {
    try {
      const armedAt = Date.now();
      const token: ClaudeDiagnosticRunToken = {
        runId: randomUUID(),
        tabId,
        armedAt,
        expiresAt: this.isEnabled() ? armedAt + ARM_TTL_MS : armedAt,
      };
      if (!this.isEnabled()) return token;
      this.armedByTab.set(tabId, { token, sessionId });
      this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.armed', {
        tabId,
        sessionId,
        expiresAt: new Date(token.expiresAt).toISOString(),
      });
      return token;
    } catch {
      const armedAt = Date.now();
      return { runId: randomUUID(), tabId, armedAt, expiresAt: armedAt };
    }
  }

  claimDeepCapture(tabId: string, sessionId?: string): ClaudeDiagnosticRunToken | undefined {
    try {
      if (!this.isEnabled()) {
        this.clearCaptureForTab(tabId);
        return undefined;
      }
      const armed = this.armedByTab.get(tabId);
      if (!armed || armed.token.expiresAt <= Date.now()) {
        this.armedByTab.delete(tabId);
        return undefined;
      }
      if (armed.sessionId && sessionId && armed.sessionId !== sessionId) return undefined;
      this.armedByTab.delete(tabId);
      this.claimedByTab.set(tabId, armed.token);
      this.armCaptureExpiryTimer(armed.token);
      this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.claimed', {
        tabId,
        sessionId,
        runId: armed.token.runId,
      });
      return armed.token;
    } catch {
      return undefined;
    }
  }

  cancelDeepCapture(tabId: string): boolean {
    try {
      const existed = this.clearCaptureForTab(tabId);
      if (this.isEnabled() && existed) {
        this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.cancelled', { tabId });
      }
      return existed;
    } catch {
      return false;
    }
  }

  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing' {
    try {
      if (!this.isEnabled()) {
        this.clearCaptureForTab(tabId);
        return 'off';
      }
      const claimed = this.claimedByTab.get(tabId);
      if (claimed) {
        if (claimed.expiresAt > Date.now()) return 'capturing';
        this.expireCapture(tabId, claimed);
      }
      const armed = this.armedByTab.get(tabId);
      if (armed && armed.token.expiresAt > Date.now()) return 'armed';
      if (armed) this.armedByTab.delete(tabId);
      return 'off';
    } catch {
      return 'off';
    }
  }

  flushRingBuffer(sessionId: string | undefined, reason: string): void {
    try {
      if (!this.isEnabled()) return;
      this.flushRingBufferIntoRun(sessionId, `retro-${randomUUID()}`, reason);
    } catch {
      // Retroactive evidence is best-effort.
    }
  }

  resolveTraceId(sessionId: string | undefined): string | undefined {
    try {
      if (!sessionId) return undefined;
      return this.store.resolveTraceId(sessionId) ?? this.sessionContextById.get(sessionId)?.traceId;
    } catch {
      return undefined;
    }
  }

  async buildSmartReport(traceId?: string, userContext?: { actual?: string; expected?: string; reproduction?: string }, options?: { selection?: 'automatic' | 'current-session' }): Promise<string> {
    try {
      return await this.reportBuilder.buildSmartReport(traceId, userContext, options);
    } catch {
      return '';
    }
  }

  async exportTrace(traceId: string, targetDirectory: string): Promise<string | undefined> {
    try {
      return await this.store.exportTraceBundle(traceId, targetDirectory);
    } catch {
      return undefined;
    }
  }

  async clearAll(): Promise<void> {
    try {
      await this.store.clear();
    } catch {
      // Deleting traces must never surface as a chat error.
    }
  }

  getStorageStatus(): TraceStoreStatus {
    try {
      return this.store.getStatus();
    } catch {
      return { mode: 'memory', rootDirectory: '', queuedEvents: 0, approximateBytes: 0, droppedEvents: 0 };
    }
  }

  listRecentTraces(limit = 20): TraceSummary[] {
    try {
      return this.store.listSummaries(limit);
    } catch {
      return [];
    }
  }

  async dispose(): Promise<void> {
    try {
      for (const turn of this.activeTurnsBySession.values()) this.clearTurnWatchdog(turn);
      this.activeTurnsBySession.clear();
      for (const timer of this.captureExpiryTimersByTab.values()) clearTimeout(timer);
      this.captureExpiryTimersByTab.clear();
      this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.stopped', {
        runtimeSegmentId: this.runtimeSegmentId,
      });
      await this.store.dispose();
    } catch {
      // Plugin shutdown must not be held open by diagnostics.
    }
  }

  private flushRingBufferIntoRun(sessionId: string | undefined, runId: string, reason: string, context = this.contextForSessionId(sessionId)): void {
    const entries = this.ringBuffer.drain(sessionId);
    for (const entry of entries) {
      this.emit({ ...context, runId }, 'stream-sync', 'sdk', 'info', 'trace.retroactive', {
        reason,
        recordedAt: new Date(entry.recordedAt).toISOString(),
        envelope: sdkEnvelope(entry.record),
        payload: entry.record.payload,
      }, {
        forceDeep: true,
        runId,
        messageUuid: entry.record.uuid,
        partId: entry.record.partId,
        toolUseId: entry.record.toolUseId,
      });
    }
  }

  private finishTurnInternal(context: ClaudeTraceContext, state: TraceTerminalState, payload?: unknown, forceDeepCapture = false): void {
    if (!this.isEnabled()) {
      this.clearTurnForContext(context);
      return;
    }
    const current = context ?? this.runtimeContext();
    this.materializeProvisionalTurn(current);
    const deep = forceDeepCapture || this.isActiveDeepCaptureContext(current);
    const active = this.activeTurnsBySession.get(current.sessionId ?? '');
    if (active && this.sameTurn(active.context, current)) this.clearTurnForContext(current);
    const turnKey = this.turnKey(current);
    if (this.finishedTurnKeys.has(turnKey)) return;
    this.finishedTurnKeys.add(turnKey);
    this.emit(current, 'lifecycle', 'plugin', state === 'completed' || state === 'cancelled' ? 'info' : 'warning', 'turn.finished', {
      state,
      ...asRecord(payload),
    }, { forceDeep: deep });
    if (state === 'error' || state === 'incomplete') this.flushRingBuffer(current.sessionId, `turn-${state}`);
  }

  private runtimeContext(): ClaudeTraceContext {
    return { traceId: this.runtimeSegmentId, runtimeSegmentId: this.runtimeSegmentId };
  }

  private contextForSessionId(sessionId: string | undefined): ClaudeTraceContext {
    if (!sessionId) return this.runtimeContext();
    return this.sessionContextById.get(sessionId) ?? {
      traceId: this.store.resolveTraceId(sessionId) ?? sessionId,
      runtimeSegmentId: this.runtimeSegmentId,
      sessionId,
    };
  }

  private armTurnWatchdog(context: ClaudeTraceContext, started = true, startPayload?: Record<string, unknown>): void {
    const sessionId = context.sessionId ?? '';
    const existing = this.activeTurnsBySession.get(sessionId);
    if (existing) this.clearTurnWatchdog(existing);
    const state: ActiveTurnState = {
      context,
      flushedAtWarning: false,
      finished: false,
      started,
      startPayload,
      deferredEvents: [],
      deferredBytes: 0,
      deferredDropped: 0,
      lastActivityAt: Date.now(),
      warningTimer: undefined,
      criticalTimer: undefined,
    };
    this.activeTurnsBySession.set(sessionId, state);
    this.scheduleTurnWatchdog(sessionId, state, TURN_WARNING_MS, TURN_CRITICAL_MS);
  }

  private resetTurnWatchdog(sessionId: string | undefined): void {
    if (!sessionId) return;
    const turn = this.activeTurnsBySession.get(sessionId);
    if (!turn || turn.finished) return;
    turn.lastActivityAt = Date.now();
    this.scheduleTurnWatchdog(sessionId, turn, TURN_WARNING_MS, TURN_CRITICAL_MS);
  }

  private rebindTurnWatchdog(sessionId: string, turn: ActiveTurnState): void {
    const elapsedMs = Math.max(0, Date.now() - turn.lastActivityAt);
    this.scheduleTurnWatchdog(
      sessionId,
      turn,
      Math.max(0, TURN_WARNING_MS - elapsedMs),
      Math.max(0, TURN_CRITICAL_MS - elapsedMs),
    );
  }

  private scheduleTurnWatchdog(
    sessionId: string,
    turn: ActiveTurnState,
    warningDelayMs: number,
    criticalDelayMs: number,
  ): void {
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
    turn.warningTimer = setTimeout(() => this.onTurnSilent(sessionId, 'warning'), warningDelayMs);
    turn.criticalTimer = setTimeout(() => this.onTurnSilent(sessionId, 'critical'), criticalDelayMs);
  }

  private clearTurnWatchdog(turn: ActiveTurnState): void {
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
  }

  private clearTurnForContext(context: ClaudeTraceContext | undefined): void {
    const sessionId = context?.sessionId;
    if (!sessionId) return;
    const turn = this.activeTurnsBySession.get(sessionId);
    if (turn && (!context || this.sameTurn(turn.context, context))) {
      turn.finished = true;
      this.clearTurnWatchdog(turn);
      this.activeTurnsBySession.delete(sessionId);
    }
    if (context?.tabId) {
      const claimed = this.claimedByTab.get(context.tabId);
      if (!claimed || !context.runId || claimed.runId === context.runId) {
        this.claimedByTab.delete(context.tabId);
        this.clearCaptureExpiryTimer(context.tabId);
      }
    }
  }

  private sameTurn(left: ClaudeTraceContext, right: ClaudeTraceContext): boolean {
    if (left.sessionId !== right.sessionId) return false;
    if (left.turnId || right.turnId) {
      return Boolean(left.turnId && right.turnId && left.turnId === right.turnId);
    }
    if (left.runId || right.runId) {
      return Boolean(left.runId && right.runId && left.runId === right.runId);
    }
    return false;
  }

  private turnKey(context: ClaudeTraceContext): string {
    return `${context.sessionId ?? ''}:${context.turnId ?? context.runId ?? 'unidentified'}`;
  }

  private onTurnSilent(sessionId: string, level: 'warning' | 'critical'): void {
    try {
      const turn = this.activeTurnsBySession.get(sessionId);
      if (!turn || turn.finished) return;
      if (!this.isEnabled()) {
        this.clearTurnForContext(turn.context);
        return;
      }
      const silentMs = level === 'warning' ? TURN_WARNING_MS : TURN_CRITICAL_MS;
      this.emit(turn.context, 'lifecycle', 'plugin', level, 'turn.stalled', { sessionId, silentMs }, {
        forceDeep: this.isActiveDeepCaptureContext(turn.context),
      });
      if (level === 'warning' && !turn.flushedAtWarning) {
        turn.flushedAtWarning = true;
        this.flushRingBuffer(sessionId, 'watchdog-warning');
      }
      if (level === 'critical') this.finishTurn(turn.context, 'incomplete', { reason: 'watchdog-critical', silentMs });
    } catch {
      // Timer callbacks must be isolated from the runtime.
    }
  }

  /** Persist a pending local session only when it needs error/stall evidence. */
  private materializeProvisionalTurn(context: ClaudeTraceContext): void {
    const sessionId = context.sessionId;
    if (!sessionId) return;
    const active = this.activeTurnsBySession.get(sessionId);
    if (!active || active.started) return;
    this.store.bindSession(sessionId, context.traceId);
    this.sessionContextById.set(sessionId, context);
    active.started = true;
    this.emit(context, 'lifecycle', 'plugin', 'info', 'session.bound', { provisional: true, via: 'sdk' });
    this.emitTurnStarted(context, active.startPayload);
    this.flushDeferredEvents(active, context);
  }

  private migrateRingBuffer(provisionalSessionId: string, sessionId: string): void {
    for (const entry of this.ringBuffer.drain(provisionalSessionId)) {
      this.ringBuffer.record(sessionId, entry);
    }
  }

  private flushDeferredEvents(active: ActiveTurnState, context: ClaudeTraceContext): void {
    for (const { event, deep } of active.deferredEvents.splice(0)) {
      const replayed: ClaudeTraceEventV1 = {
        ...event,
        timestamp: new Date().toISOString(),
        monotonicSequence: ++this.sequence,
        traceId: context.traceId,
        sessionId: context.sessionId,
        turnId: context.turnId,
      };
      this.store.append(replayed, deep);
      this.mirrorToConsole(replayed);
    }
    active.deferredBytes = 0;
    if (active.deferredDropped > 0) {
      this.emit(context, 'lifecycle', 'storage', 'warning', 'trace.deferred_dropped', {
        count: active.deferredDropped,
        maxEvents: MAX_DEFERRED_EVENTS,
        maxBytes: MAX_DEFERRED_BYTES,
      });
      active.deferredDropped = 0;
    }
  }

  private emitTurnStarted(context: ClaudeTraceContext, payload?: Record<string, unknown>): void {
    this.emit(context, 'lifecycle', 'plugin', 'info', 'turn.started', payload);
  }

  private deferEvent(active: ActiveTurnState, event: ClaudeTraceEventV1, deep: boolean): void {
    const bytes = byteLength(event);
    if (
      active.deferredEvents.length >= MAX_DEFERRED_EVENTS
      || active.deferredBytes + bytes > MAX_DEFERRED_BYTES
    ) {
      active.deferredDropped += 1;
      return;
    }
    active.deferredEvents.push({ event, deep });
    active.deferredBytes += bytes;
  }

  // eslint-disable-next-line max-params -- One emission seam keeps each event's safety and redaction choices auditable.
  private emit(context: ClaudeTraceContext, channel: ClaudeTraceChannelId, source: ClaudeTraceSource, severity: TraceSeverity, name: string, payload?: unknown, options?: { metrics?: Record<string, number>; forceDeep?: boolean; runId?: string; messageUuid?: string; partId?: string; toolUseId?: string }): void {
    try {
      if (!this.isEnabled()) return;
      this.store.enable();
      const redacted = payload === undefined ? undefined : this.redactor.redact(payload, channel === 'service-output' ? 'service-output' : 'ordinary');
      const deep = options?.forceDeep ?? this.isActiveDeepCaptureContext(context);
      const event: ClaudeTraceEventV1 = {
        schemaVersion: CLAUDE_TRACE_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        monotonicSequence: ++this.sequence,
        traceId: context.traceId,
        runtimeSegmentId: context.runtimeSegmentId,
        runId: options?.runId ?? context.runId,
        sessionId: context.sessionId,
        turnId: context.turnId,
        messageUuid: options?.messageUuid,
        partId: options?.partId,
        toolUseId: options?.toolUseId,
        channel,
        source,
        severity,
        name,
        metrics: { ...(redacted ? this.redactionMetrics(redacted.stats) : {}), ...options?.metrics },
        payload: redacted?.value,
        payloadRef: { kind: deep ? 'deep' : 'inline', runId: options?.runId ?? context.runId },
      };
      const active = context.sessionId ? this.activeTurnsBySession.get(context.sessionId) : undefined;
      // A retroactive flush deliberately supplies a run-id-bearing context
      // clone. Match the active turn by its semantic turn key so pre-bind
      // evidence remains deferred until the durable SDK session is known.
      if (active && !active.started && this.sameTurn(active.context, context)) {
        this.deferEvent(active, event, deep);
        return;
      }
      this.store.append(event, deep);
      this.mirrorToConsole(event);
    } catch {
      // The central diagnostics safety boundary.
    }
  }

  private mirrorToConsole(event: ClaudeTraceEventV1): void {
    try {
      const settings = this.settings();
      if (settings.consolePreset === 'off') return;
      const anomaly = event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error';
      if (!anomaly && (settings.consolePreset !== 'full' || !settings.consoleChannels[event.channel])) return;
      const line = `[claude-trace] ${event.severity} ${event.channel}/${event.name}`;
      if (anomaly) logger.warn(line, event.payload ?? '');
      else logger.debug(line, event.payload ?? '');
    } catch {
      // Console mirroring is diagnostics-only.
    }
  }

  private settings(): ClaudeSessionTraceSettings {
    try {
      return this.options.settings();
    } catch {
      return { enabled: false, consolePreset: 'off', consoleChannels: { lifecycle: false, 'stream-sync': false, 'tool-interaction': false, 'persistence-recovery': false, 'service-output': false }, storageDirectory: '' };
    }
  }

  private runtimeMetadata(): Record<string, unknown> {
    try {
      return this.options.runtimeMetadata?.() ?? {};
    } catch {
      return {};
    }
  }

  private isEnabled(): boolean {
    return this.settings().enabled;
  }

  private clearCaptureForTab(tabId: string): boolean {
    const armed = this.armedByTab.delete(tabId);
    const claimed = this.claimedByTab.delete(tabId);
    this.clearCaptureExpiryTimer(tabId);
    return armed || claimed;
  }

  private isActiveDeepCaptureToken(token: ClaudeDiagnosticRunToken | undefined): boolean {
    if (!token || token.expiresAt <= Date.now()) return false;
    return this.claimedByTab.get(token.tabId)?.runId === token.runId;
  }

  private isActiveDeepCaptureContext(context: ClaudeTraceContext): boolean {
    if (!context.deepCapture || !context.tabId || !context.runId) return false;
    const claimed = this.claimedByTab.get(context.tabId);
    if (claimed?.runId === context.runId && claimed.expiresAt > Date.now()) return true;
    if (claimed?.runId === context.runId) this.expireCapture(context.tabId, claimed);
    context.deepCapture = false;
    return false;
  }

  private armCaptureExpiryTimer(token: ClaudeDiagnosticRunToken): void {
    this.clearCaptureExpiryTimer(token.tabId);
    const remainingMs = Math.max(0, token.expiresAt - Date.now());
    this.captureExpiryTimersByTab.set(token.tabId, setTimeout(() => {
      try {
        const claimed = this.claimedByTab.get(token.tabId);
        if (claimed?.runId === token.runId && claimed.expiresAt <= Date.now()) {
          this.expireCapture(token.tabId, claimed);
        }
      } catch {
        // Capture expiry must never surface on the chat path.
      }
    }, remainingMs));
  }

  private clearCaptureExpiryTimer(tabId: string): void {
    const timer = this.captureExpiryTimersByTab.get(tabId);
    if (timer) clearTimeout(timer);
    this.captureExpiryTimersByTab.delete(tabId);
  }

  private expireCapture(tabId: string, token: ClaudeDiagnosticRunToken): void {
    if (this.claimedByTab.get(tabId)?.runId !== token.runId) return;
    const activeTurns = [...this.activeTurnsBySession.values()].filter((turn) =>
      turn.context.tabId === tabId && turn.context.runId === token.runId && !turn.finished);
    if (activeTurns.length === 0) {
      this.claimedByTab.delete(tabId);
      this.clearCaptureExpiryTimer(tabId);
      return;
    }
    for (const turn of activeTurns) {
      this.emit(turn.context, 'lifecycle', 'plugin', 'warning', 'anomaly.capture_expired', {
        tabId,
        runId: token.runId,
        expiresAt: new Date(token.expiresAt).toISOString(),
      }, { forceDeep: true });
      this.finishTurnInternal(turn.context, 'incomplete', { reason: 'capture-expired' }, true);
    }
  }

  private redactionMetrics(stats: { secretsRemoved: number; pathsNormalized: number; valuesTruncated: number }): Record<string, number> {
    return { redactedSecrets: stats.secretsRemoved, normalizedPaths: stats.pathsNormalized, truncatedValues: stats.valuesTruncated };
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function prefixedName(prefix: 'permission' | 'elicitation' | 'persistence', operation: string): string {
  const safeOperation = safeName(operation);
  return safeOperation.startsWith(`${prefix}.`) ? safeOperation : `${prefix}.${safeOperation}`;
}

function byteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch {
    return 0;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sdkRecord(message: unknown, redactor: TraceRedactor): ClaudeSdkTraceRecord {
  const record = asRecord(message);
  const nested = asRecord(record.message);
  const type = readString(record.type) ?? 'unknown';
  const subtype = readString(record.subtype);
  const uuid = readString(record.uuid) ?? readString(nested.uuid);
  const partId = readString(record.partId) ?? readString(record.part_id) ?? readString(nested.id);
  const toolUseId = readString(record.toolUseId) ?? readString(record.tool_use_id) ?? readString(nested.id);
  return {
    type: safeName(type),
    subtype: subtype ? safeName(subtype) : undefined,
    uuid,
    partId,
    toolUseId,
    bytes: byteLength(message),
    payload: redactor.redact(message).value,
  };
}

function sdkEnvelope(record: ClaudeSdkTraceRecord): Record<string, unknown> {
  return {
    type: record.type,
    subtype: record.subtype,
    uuid: record.uuid,
    partId: record.partId,
    toolUseId: record.toolUseId,
    bytes: record.bytes,
  };
}

function chunkEnvelope(
  chunkType: string,
  chunk: unknown,
  identifiers: { messageUuid?: string; partId?: string; toolUseId?: string },
): Record<string, unknown> {
  return {
    chunkType: safeName(chunkType),
    ...identifiers,
    payload: summarize(chunk),
  };
}

function summarize(payload: unknown): unknown {
  if (payload === undefined || payload === null) return undefined;
  if (Array.isArray(payload)) return { type: 'array', length: payload.length };
  if (typeof payload === 'object') return { type: 'object', keys: Object.keys(payload as Record<string, unknown>).slice(0, 40) };
  if (typeof payload === 'string') return { type: 'string', length: payload.length };
  return { type: typeof payload };
}

function identifiersFrom(value: unknown): { messageUuid?: string; partId?: string; toolUseId?: string } {
  const record = asRecord(value);
  return {
    messageUuid: readString(record.messageUuid) ?? readString(record.messageId) ?? readString(record.uuid),
    partId: readString(record.partId) ?? readString(record.part_id),
    toolUseId: readString(record.toolUseId) ?? readString(record.tool_use_id) ?? readString(record.id),
  };
}

function isSdkError(message: unknown): boolean {
  const record = asRecord(message);
  return record.is_error === true || record.isError === true || readString(record.subtype) === 'error' || readString(record.type) === 'error';
}

/**
 * Collect non-empty credential-like values from a Claude Code settings subtree
 * at call time. Walks arrays/objects recursively (cycle-safe via WeakSet) and
 * only emits values whose enclosing key looks like an api key / token / secret.
 * Exported so the plugin entry point can hand the live redaction secrets to the
 * trace service without growing `main.ts` ownership.
 */
export function collectClaudeCodeKnownSecrets(value: unknown): string[] {
  const secrets = new Set<string>();
  const visited = new WeakSet<object>();
  const visit = (current: unknown, keyHint?: string): void => {
    if (typeof current === 'string') {
      if (keyHint && /(?:api[_-]?key|token|secret)/i.test(keyHint) && current.trim()) {
        secrets.add(current.trim());
      }
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      current.forEach((entry) => visit(entry, keyHint));
      return;
    }
    Object.entries(current as Record<string, unknown>).forEach(([key, child]) => visit(child, key));
  };
  visit(value);
  return [...secrets];
}

function extractClaudeTraceMetadata(events: ClaudeTraceEventV1[]): string[] {
  const sessions = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const turns = new Set(events.map((event) => event.turnId).filter(Boolean));
  const retro = events.filter((event) => event.name === 'trace.retroactive').length;
  const stalls = events.filter((event) => event.name === 'turn.stalled').length;
  const redactedSecrets = events.reduce((sum, event) => sum + (event.metrics?.redactedSecrets ?? 0), 0);
  return [
    `Sessions: ${sessions.size}`,
    `Turns: ${turns.size}`,
    `Retroactive SDK events: ${retro}`,
    `Stall anomalies: ${stalls}`,
    `Redacted secrets: ${redactedSecrets}`,
  ];
}
