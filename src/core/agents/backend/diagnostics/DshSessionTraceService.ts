/* eslint-disable max-lines -- single trace owner: wire projection, session binding, and ledger projection stay in one auditable service (mirrors CodexSessionTraceService). */
import { createHash, randomUUID } from 'crypto';

import {
  resolveDefaultTraceDirectory,
  TraceRedactor,
  TraceReportBuilder,
  type TraceSeverity,
  TraceStore,
  type TraceStoreStatus,
  type TraceSummary,
} from '../../../../shared/diagnostics';
import { createLogger } from '../../../../shared/logger';
import {
  DSH_STOP_REASON_VALUES,
  DSH_TOOL_KIND_VALUES,
  DSH_TOOL_STATUS_VALUES,
  DSH_TRACE_SCHEMA_VERSION,
  DSH_WIRE_ERROR_KINDS,
  type DshSessionTraceSettings,
  type DshTraceChannelId,
  type DshTraceContext,
  type DshTraceEventV1,
  type DshTraceLedgerEntry,
  type DshTraceLedgerSnapshot,
  type DshTracePort,
  type DshTraceSource,
  type DshTransportId,
  type DshWireRecord,
} from './types';

const logger = createLogger('DshTrace');

/** Native update discriminators whose high-frequency chunk rows coalesce under store pressure. */
const DELTA_SESSION_UPDATES = new Set(['agent_message_chunk', 'agent_thought_chunk']);
/** Update discriminators shown in the readable ledger (as `update.<name>` rows). */
const LEDGER_UPDATE_NAMES = new Set(['tool_call', 'tool_call_update', 'usage_update', 'goal_update']);
/** Ledger rows hard-capped so one noisy session cannot flood the context modal. */
const LEDGER_ROW_LIMIT = 300;
/**
 * Per-trace capture budget in stored events. This is a service-layer metadata
 * budget (not the store's own pressure accounting and not the ledger row cap):
 * once a trace reaches it, a single `trace.session_limit` marker is stored and
 * further collection for that trace stops. The ledger surfaces `limited`.
 * Exported for focused budget tests only.
 */
export const MAX_EVENTS_PER_TRACE = 2000;
/**
 * Service-wide capture budget across every trace of this instance (~16MiB of
 * typical event volume). When it is reached, one `trace.capture_limit` marker
 * lands in the runtime segment and all collection stops, so long-running
 * processes cannot inflate storage through endless new traces.
 */
export const MAX_TOTAL_CAPTURE_EVENTS = 40_000;
/**
 * Structural cap on tracked per-trace budgets. When full, NEW traces are
 * refused outright instead of evicting existing budgets — eviction would let
 * an already-capped trace silently restart its count and grow past its bound.
 */
export const MAX_BUDGET_ENTRIES = 1024;
/** Bound on open prompt turns; the oldest still-open turn is abandoned unpaired. */
const MAX_OPEN_TURNS = 1024;
/** Bound on tracked server-request methods awaiting their reply; oldest evicted. */
const MAX_SERVER_REQUEST_METHODS = 1024;
/** Bound on cached session binding contexts; eviction only drops the cache, the store index persists. */
const MAX_SESSION_BINDINGS = 512;
/**
 * Hard cap on registered client source generations (`sourceId@generation`,
 * registered only by the explicit `starting` start boundary). Never evicted:
 * when full, NEW sources are refused fail-closed with a one-shot runtime
 * marker, so eviction can never silently re-open a dead source's gate.
 */
export const MAX_SOURCE_REGISTRATIONS = 1024;
/**
 * Oversize read guard: summaries far beyond the capture budget were written by
 * older builds without the budget; their full history is refused instead of
 * streamed, and the honest summary counts are projected instead.
 */
const OVERSIZE_SUMMARY_EVENT_COUNT = MAX_EVENTS_PER_TRACE * 4;
/** How long an observed tool span may stay open before it is no longer paired (ms). */
const TOOL_SPAN_MAX_MS = 30 * 60 * 1000;
/** Tool statuses that may end a span: only explicit terminal states. */
const TOOL_TERMINAL_STATUSES = new Set(['completed', 'failed']);
/** Fixed wire-failure classification tokens accepted by the intake whitelist. */
const WIRE_ERROR_KINDS = new Set<string>(DSH_WIRE_ERROR_KINDS);
const WIRE_STOP_REASONS = new Set<string>(DSH_STOP_REASON_VALUES);
const WIRE_TOOL_KINDS = new Set<string>(DSH_TOOL_KIND_VALUES);
const WIRE_TOOL_STATUSES = new Set<string>(DSH_TOOL_STATUS_VALUES);
/** Service-layer intake whitelist: the only detail keys that may reach the store. */
const WIRE_DETAIL_STRING_KEYS = new Set(['sessionUpdate', 'toolCallId', 'messageId', 'kind', 'status', 'nativeProtocol']);
const WIRE_DETAIL_ENUM_KEYS = new Set(['kind', 'status']);
const WIRE_DETAIL_NUMBER_KEYS = new Set(['usedTokens', 'contextWindow', 'inputTokens', 'outputTokens', 'backendTimeMs', 'errorCode', 'optionCount', 'questionCount']);
/** Bounded identifier cap for string detail values. */
const WIRE_DETAIL_STRING_MAX = 128;
/** sessionUpdate discriminators are snake_case protocol tokens, nothing else. */
const SESSION_UPDATE_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export interface DshSessionTraceServiceOptions {
  settings: () => DshSessionTraceSettings;
  vaultPath?: string;
  buildIdentity?: () => string;
  /** Redaction dictionary getter; must reuse an existing safe runtime getter. */
  knownSecrets?: () => readonly string[];
  runtimeMetadata?: () => Record<string, unknown>;
}

interface OpenTurnState {
  sessionId: string;
  transport: DshTransportId;
  /** `sourceId@generation` (or `legacy@transport`) of the client that opened the turn. */
  sourceKey: string;
  requestId: number;
}

/** Everything appendEvent needs beyond the context, bundled to stay under param limits. */
interface DshTraceEventDraft {
  channel: DshTraceChannelId;
  source: DshTraceSource;
  severity: TraceSeverity;
  name: string;
  payload?: unknown;
  metrics?: Record<string, number>;
}

/** Credential-shaped runs (keys, bearer tokens, JWTs) scrubbed again at projection time. */
function scrubCredentialShapes(text: string): string {
  return text
    .replace(/\b(bearer\s+)[^\s'",;]{8,}/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, '[redacted]');
}

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function firstNumber(payload: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

/**
 * Projects stored DSH trace events into the whitelisted ledger snapshot shown
 * in the context modal. Chat-execution rows (turns, tool lifecycle, usage,
 * approvals, capture-limit markers) are readable entries; transport/control-read
 * wire rows are not stored at all any more, and message chunk deltas / config
 * pushes stay out of the main ledger while still counting toward
 * `timing.eventCount`.
 *
 * Every timestamp and duration in the ledger is client-observed: rows are
 * always labeled `client`, tool spans are computed only from client arrival
 * times, and backend envelope times are never mixed into a span or used to
 * relabel a row.
 *
 * A tool span ends only on an explicit terminal status (`completed`/`failed`)
 * that shares the wire source (`sourceId@generation`), session id, and tool
 * call id with its start row. `in_progress` and unknown statuses keep the
 * start open and never produce a duration. A missing end stays unknown —
 * never synthesized.
 */
export function projectDshTraceLedger(events: readonly DshTraceEventV1[]): DshTraceLedgerSnapshot {
  const entries: DshTraceLedgerEntry[] = [];
  let lastTurnClientRoundTripMs: number | undefined;
  let observedTurnCount = 0;
  let limited = false;
  const sessionEvents = events.filter((event) => Boolean(event.sessionId));
  const openToolStarts = new Map<string, string>();
  for (const event of sessionEvents) {
    if (event.name === 'trace.session_limit') limited = true;
    if (event.name === 'turn.started') observedTurnCount += 1;
    const finishRoundTrip = noteTurnFinishRoundTrip(event);
    if (finishRoundTrip !== undefined) lastTurnClientRoundTripMs = finishRoundTrip;
    const payload = eventPayload(event);
    trackToolCallStart(openToolStarts, event, payload);
    const entry = ledgerEntryForEvent(event);
    pairTerminalToolSpan(openToolStarts, event, payload, entry);
    if (entry) entries.push(entry);
  }
  entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const capped = entries.slice(-LEDGER_ROW_LIMIT);
  const lastEvent = sessionEvents[sessionEvents.length - 1];
  return {
    entries: capped,
    ...(limited ? { limited: true } : {}),
    timing: {
      ...(lastTurnClientRoundTripMs !== undefined ? { lastTurnClientRoundTripMs } : {}),
      observedTurnCount,
      eventCount: sessionEvents.length,
      ...(lastEvent ? { lastEventAt: lastEvent.timestamp } : {}),
    },
  };
}

/** Returns the client round trip of a finished turn row, if it carried one. */
function noteTurnFinishRoundTrip(event: DshTraceEventV1): number | undefined {
  if (event.name !== 'turn.finished') return undefined;
  const roundTrip = event.metrics?.clientRoundTripMs;
  return typeof roundTrip === 'number' && Number.isFinite(roundTrip) ? roundTrip : undefined;
}

/** Records a tool start row under its source/session/call pairing key. */
function trackToolCallStart(openToolStarts: Map<string, string>, event: DshTraceEventV1, payload: Record<string, unknown>): void {
  if (event.name !== 'update.tool_call') return;
  const toolCallId = firstString(payload, ['toolCallId']);
  if (toolCallId) openToolStarts.set(toolPairingKey(event, toolCallId), event.timestamp);
}

/**
 * Ends a tool span only when the terminal row is an explicit
 * `completed`/`failed` update sharing the start row's wire source, session,
 * and call id; `in_progress` and unknown statuses keep the start open.
 */
function pairTerminalToolSpan(
  openToolStarts: Map<string, string>,
  event: DshTraceEventV1,
  payload: Record<string, unknown>,
  entry: DshTraceLedgerEntry | undefined,
): void {
  if (!entry || event.name !== 'update.tool_call_update') return;
  const toolCallId = firstString(payload, ['toolCallId']);
  if (!toolCallId) return;
  const key = toolPairingKey(event, toolCallId);
  const start = openToolStarts.get(key);
  const status = firstString(payload, ['status']);
  if (!start || status === undefined || !TOOL_TERMINAL_STATUSES.has(status)) return;
  openToolStarts.delete(key);
  const spanMs = observedToolSpanMs(start, event);
  if (spanMs !== undefined) {
    entry.durationMs = spanMs;
    entry.durationKind = 'observed-tool-span';
  }
}

/** Tool spans pair only within one wire source (`sourceId@generation`), session, and call id. */
function toolPairingKey(event: DshTraceEventV1, toolCallId: string): string {
  return `${event.wireSource ?? ''}|${event.sessionId ?? ''}|${toolCallId}`;
}

function eventPayload(event: DshTraceEventV1): Record<string, unknown> {
  return (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload
    : {}) as Record<string, unknown>;
}

/**
 * Bounded protocol discriminator: session update names are snake_case tokens;
 * anything else (free text, over-length) collapses to `unknown` so event names
 * can never carry arbitrary wire text.
 */
function normalizeSessionUpdate(value: string | undefined): string {
  return value !== undefined && SESSION_UPDATE_PATTERN.test(value) ? value : 'unknown';
}

/**
 * Client-clock-only span between the tool start row and its terminal row.
 * Both timestamps are client arrival times, so no clock-source mixing is
 * possible; backend envelope times are never used for spans.
 */
function observedToolSpanMs(startTimestamp: string, endEvent: DshTraceEventV1): number | undefined {
  const span = Date.parse(endEvent.timestamp) - Date.parse(startTimestamp);
  return Number.isFinite(span) && span >= 0 && span <= TOOL_SPAN_MAX_MS ? span : undefined;
}

function ledgerEntryForEvent(event: DshTraceEventV1): DshTraceLedgerEntry | undefined {
  const payload = eventPayload(event);
  // Every stored timestamp is the client emit time, so the label is always
  // `client`: a backend envelope time in the payload must never relabel a row.
  const base = {
    timestamp: event.timestamp,
    timeSource: 'client' as const,
    severity: event.severity,
  };
  const sessionUpdate = firstString(payload, ['sessionUpdate']);
  switch (event.name) {
    case 'turn.started':
      return { ...base, name: event.name };
    case 'turn.finished': {
      // Whitelisted enum tokens only. An RPC-ok response is `response-received`
      // (a client-observed receipt); the strict stopReason reports how the
      // harness says the turn ended, and nothing here claims model completion.
      const parts = [
        firstString(payload, ['state']) ?? 'unknown',
        firstString(payload, ['stopReason']),
        firstString(payload, ['kind']),
        firstString(payload, ['reason']),
      ].filter((part): part is string => Boolean(part));
      const roundTrip = event.metrics?.clientRoundTripMs;
      return {
        ...base,
        name: event.name,
        detail: parts.join(': '),
        ...(typeof roundTrip === 'number' && Number.isFinite(roundTrip)
          ? { durationMs: roundTrip, durationKind: 'client-round-trip' as const }
          : {}),
      };
    }
    case 'turn.cancel_requested':
      return { ...base, name: event.name };
    case 'session.bound':
      return { ...base, name: event.name };
    case 'trace.session_limit': {
      const limit = firstNumber(payload, ['limit']);
      return { ...base, name: event.name, ...(limit !== undefined ? { detail: `limit ${limit}` } : {}) };
    }
    case 'permission.request':
    case 'question.request':
      return {
        ...base,
        name: event.name,
        detail: typeof payload.optionCount === 'number'
          ? `${payload.optionCount} options`
          : typeof payload.questionCount === 'number'
            ? `${payload.questionCount} questions`
            : undefined,
      };
    case 'permission.reply':
      return { ...base, name: event.name, detail: firstString(payload, ['outcome']) };
    default:
      break;
  }
  if (event.name.startsWith('update.')) {
    const updateName = event.name.slice('update.'.length);
    if (!LEDGER_UPDATE_NAMES.has(updateName)) return undefined;
    return { ...base, name: event.name, detail: updateDetailText(updateName, payload, sessionUpdate) };
  }
  return undefined;
}

function updateDetailText(updateName: string, payload: Record<string, unknown>, sessionUpdate?: string): string | undefined {
  const parts: string[] = [];
  // Tool titles are free-form text and never enter the trace; only the
  // whitelisted status enum and usage numbers describe an update row.
  const status = firstString(payload, ['status']);
  if (status) parts.push(status);
  if (updateName === 'usage_update') {
    const used = firstNumber(payload, ['usedTokens']);
    const window = firstNumber(payload, ['contextWindow']);
    if (used !== undefined) parts.push(`used ${used}`);
    if (window !== undefined) parts.push(`window ${window}`);
  }
  if (updateName === 'goal_update') parts.push('goal');
  if (parts.length === 0 && sessionUpdate) parts.push(sessionUpdate);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * DSH (DeepSeek Harness) wire-trace owner.
 *
 * Narrowed contract for this round: metadata, lifecycle, and timing only — no
 * deep capture and no raw-content capture under any setting. The client hook
 * forwards already-whitelisted `DshWireRecord`s and this service enforces the
 * whitelist again on intake (detail keys, enum values, bounded identifiers,
 * fixed error tokens) before the hardened shared redactor runs, so no free
 * text — error messages, stderr, tool titles/reasons, prompts, config — can
 * reach the store, console mirror, report, or ledger from any path. Durations
 * are client-observed round trips and are always labeled as such; model
 * execution time has no source and is never fabricated.
 *
 * Isolation: every client instance carries a unique `sourceId`, and every
 * (re)start a `generation`. All per-client state — open prompt turns, tracked
 * server requests, session binding contexts, dead-source gating, ledger tool
 * pairing — is keyed by `sourceId@generation`, so concurrent main/aux clients
 * and old/new client generations can never collide, same-named sessions from
 * different clients never merge, and a dead client only silences itself, not
 * the transport. Each trace also has a capture budget: reaching it stores a
 * single `trace.session_limit` marker, stops collection for that trace, and
 * the ledger reports `limited`.
 *
 * Session binding and turn lifecycle are derived entirely from wire records,
 * so the adapter needs no trace calls at all — the injected observer is the
 * only seam. Native and ACP transports are gated independently by settings.
 */
export class DshSessionTraceService implements DshTracePort {
  readonly runtimeSegmentId = randomUUID();
  readonly store: TraceStore<DshTraceEventV1>;
  readonly reportBuilder: TraceReportBuilder<DshTraceEventV1>;
  private readonly redactor: TraceRedactor;
  private sequence = 0;
  /** Session binding contexts keyed by `sourceKey|sessionId`. */
  private readonly sessions = new Map<string, DshTraceContext>();
  /** Open prompt turns keyed by `sourceKey#requestId` — request ids are only unique per client. */
  private readonly openTurns = new Map<string, OpenTurnState>();
  /** Server-request methods awaiting a reply, keyed by `sourceKey#requestId`. */
  private readonly serverRequestMethods = new Map<string, string>();
  /**
   * Registered client source generations (`sourceId@generation`), added only
   * by the explicit `starting` start boundary. Never evicted; a full registry
   * refuses new sources fail-closed. Records without source identity (legacy
   * test/compat only) bypass registration and keep the old transport key.
   */
  private readonly knownSources = new Set<string>();
  /**
   * Source keys whose last connection record was closed/error. A dead client
   * generation is dropped until its own fresh `starting` arrives — never by
   * eviction — so a stopped client can never resume writing and one client's
   * death never mutes another live client on the same transport.
   */
  private readonly deadSources = new Set<string>();
  /** One-shot guard for the runtime registry-full marker. */
  private sourceRegistryFullNotified = false;
  private budgetRegistryFull = false;
  /** Per-trace capture budgets keyed by traceId. Never evicted; full map refuses new traces. */
  private readonly traceBudgets = new Map<string, { count: number; limited: boolean }>();
  /** Service-wide captured event count across every trace of this instance. */
  private totalCapturedEvents = 0;
  /** Set once the service-wide capture budget is reached; stops all collection. */
  private globalCaptureStopped = false;

  constructor(private readonly options: DshSessionTraceServiceOptions) {
    const storageDirectory = options.settings().storageDirectory.trim();
    const anyGateOn = this.isEnabled('native') || this.isEnabled('acp');
    this.store = new TraceStore<DshTraceEventV1>(
      storageDirectory || undefined,
      resolveDefaultTraceDirectory('dsh'),
      {
        bundlePrefix: 'dsh-trace',
        // The DSH run analog is a `session/prompt` round trip: turn.started.
        runStartEventName: 'turn.started',
        disabled: !anyGateOn,
        sanitizeExport: (content) => this.redactExportContent(content),
      },
    );
    this.redactor = new TraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets,
      redactionMode: 'hardened',
    });
    this.reportBuilder = new TraceReportBuilder<DshTraceEventV1>(
      this.store,
      options.buildIdentity ?? (() => 'Build: unknown'),
      this.redactor,
      { title: 'OpenCodian DSH Session Trace', extractMetadata: extractDshTraceMetadata },
    );
    this.store.onDegraded(() => {
      this.emit(this.runtimeContext('native'), { channel: 'lifecycle', source: 'storage', severity: 'critical', name: 'trace.storage_degraded',
        payload: { kind: 'storage-degraded', fallback: 'memory-ring' } });
    });
    this.emit(this.runtimeContext('native'), { channel: 'lifecycle', source: 'plugin', severity: 'info', name: 'runtime.started', payload: {
      runtimeSegmentId: this.runtimeSegmentId,
      platform: process.platform,
      storageDirectory: this.store.rootDirectory,
      ...options.runtimeMetadata?.(),
    } });
  }

  // ---- DshAcpWireObserver ----

  recordWireEvent(record: DshWireRecord): void {
    try {
      // Connection records drive bounded lifecycle registration/dead-marking
      // that must run even while the transport gate is off: a `starting` seen
      // while disabled still registers its generation, so enabling the trace
      // later admits that real client instead of refusing it as unknown.
      // No events are stored or mirrored for a gated-off transport — emit()
      // re-checks the gate, and the cleanup paths below are pure memory.
      if (record.kind === 'connection') {
        this.recordConnection(record);
        return;
      }
      if (!this.isEnabled(record.transport)) return;
      const sourceKey = this.sourceKeyOf(record);
      if (record.sourceId !== undefined && record.generation !== undefined) {
        // Fail-closed source gate: only an explicitly registered client
        // generation may write, and a registered-then-dead generation stays
        // dead. Nothing is ever evicted to re-open it, and one client's death
        // never mutes another live client that shares the transport.
        if (!this.knownSources.has(sourceKey) || this.deadSources.has(sourceKey)) return;
      } else if (this.deadSources.has(sourceKey)) {
        // Records without source identity (legacy test/compat only) keep the
        // old transport-keyed dead gate.
        return;
      }
      switch (record.kind) {
        case 'request': this.recordRequest(record); break;
        case 'response': this.recordResponse(record); break;
        case 'notification': this.recordNotification(record); break;
        case 'client-notification': this.recordClientNotification(record); break;
        case 'server-request': this.recordServerRequest(record); break;
        case 'server-reply': this.recordServerReply(record); break;
      }
    } catch {
      // Diagnostics must never affect the DSH transport path.
    }
  }

  // ---- DshTracePort ----

  resolveTraceId(sessionId: string | undefined): string | undefined {
    if (!sessionId) return undefined;
    return this.store.resolveTraceId(sessionId) ?? this.stableTraceId(sessionId);
  }

  async readSessionLedger(sessionId: string): Promise<DshTraceLedgerSnapshot | null> {
    const captureLimited = this.globalCaptureStopped || this.sourceRegistryFullNotified || this.budgetRegistryFull;
    const traceId = this.store.resolveTraceId(sessionId);
    if (!traceId) return captureLimited
      ? { entries: [], limited: true, timing: { observedTurnCount: 0, eventCount: 0 } } : null;
    // Bounded-read guard: a trace far beyond this service's capture budget was
    // written before the budget existed. Its full history is refused rather
    // than streamed into memory, and the honestly-known summary counts are
    // reported instead of a fabricated complete ledger.
    const summary = this.store.listSummaries(Number.MAX_SAFE_INTEGER).find((entry) => entry.traceId === traceId);
    if (summary && summary.eventCount > OVERSIZE_SUMMARY_EVENT_COUNT) {
      return {
        entries: [],
        limited: true,
        timing: {
          observedTurnCount: 0,
          eventCount: summary.eventCount,
          ...(summary.lastUpdatedAt ? { lastEventAt: summary.lastUpdatedAt } : {}),
        },
      };
    }
    const events = await this.store.readTrace(traceId);
    const limited = captureLimited || this.traceBudgets.get(traceId)?.limited === true;
    if (events.length === 0) return limited
      ? { entries: [], limited: true, timing: { observedTurnCount: 0, eventCount: summary?.eventCount ?? 0 } } : null;
    const ledger = projectDshTraceLedger(events);
    return limited ? { ...ledger, limited: true } : ledger;
  }

  getStorageStatus(): TraceStoreStatus {
    return this.store.getStatus();
  }

  listRecentTraces(limit?: number): TraceSummary[] {
    return this.store.listSummaries(limit);
  }

  async buildSmartReport(
    traceId?: string,
    userContext?: { actual?: string; expected?: string; reproduction?: string },
    options?: { selection?: 'automatic' | 'current-session' },
  ): Promise<string> {
    return this.reportBuilder.buildSmartReport(traceId, userContext, options);
  }

  async exportTrace(traceId: string, targetDirectory: string): Promise<string | undefined> {
    try {
      return await this.store.exportTraceBundle(traceId, targetDirectory);
    } catch {
      return undefined;
    }
  }

  async clearAll(): Promise<void> {
    await this.store.clear();
  }

  async dispose(): Promise<void> {
    this.emit(this.runtimeContext('native'), { channel: 'lifecycle', source: 'plugin', severity: 'info', name: 'runtime.stopped', payload: { runtimeSegmentId: this.runtimeSegmentId } });
    await this.store.dispose();
  }

  // ---- wire record handling ----

  private recordRequest(record: DshWireRecord): void {
    const sourceKey = this.sourceKeyOf(record);
    if (record.method === 'session/prompt' && record.sessionId) {
      const context = this.bindSession(record.sessionId, sourceKey, record.transport);
      const requestId = typeof record.requestId === 'number' ? record.requestId : undefined;
      if (requestId !== undefined) {
        this.openTurns.set(`${sourceKey}#${requestId}`, { sessionId: record.sessionId, transport: record.transport, sourceKey, requestId });
        this.evictMapOldest(this.openTurns, MAX_OPEN_TURNS);
      }
      this.emit(context, { channel: 'lifecycle', source: 'plugin', severity: 'info', name: 'turn.started', payload: { requestId }, ...{ metrics: {} } });
      return;
    }
    if (record.method === 'session/new' || record.method === 'session/resume') {
      // Binding happens on the response (sessionId confirmed there).
      return;
    }
    // Bounded-collection contract: per-call protocol rows (session/list,
    // session/todos polling, control reads) are no longer stored. They never
    // reached the ledger and only inflated stored volume and eventCount.
  }

  private recordResponse(record: DshWireRecord): void {
    const sourceKey = this.sourceKeyOf(record);
    const requestId = typeof record.requestId === 'number' ? record.requestId : undefined;
    if (requestId !== undefined && record.method === 'session/prompt') {
      const turnKey = `${sourceKey}#${requestId}`;
      const open = this.openTurns.get(turnKey);
      this.openTurns.delete(turnKey);
      if (open) {
        const context = this.bindSession(open.sessionId, sourceKey, open.transport, requestId);
        // An RPC-ok envelope is a client-observed receipt, never proof the
        // model turn completed; the strict stopReason enum carries whatever
        // the harness actually reported (cancelled, max_tokens, ...).
        this.emit(context, { channel: 'lifecycle', source: 'plugin', severity: record.ok ? 'info' : 'error', name: 'turn.finished', payload: record.ok
            ? {
              state: 'response-received',
              ...(record.stopReason !== undefined && WIRE_STOP_REASONS.has(record.stopReason) ? { stopReason: record.stopReason } : {}),
            }
            : {
              state: 'error',
              ...(record.error !== undefined && WIRE_ERROR_KINDS.has(record.error) ? { kind: record.error } : {}),
              ...(typeof record.errorCode === 'number' && Number.isFinite(record.errorCode) ? { errorCode: record.errorCode } : {}),
            }, ...{ metrics: { ...(record.durationMs !== undefined ? { clientRoundTripMs: record.durationMs } : {}) } } });
        return;
      }
    }
    if ((record.method === 'session/new' || record.method === 'session/resume') && record.ok && record.sessionId) {
      const context = this.bindSession(record.sessionId, sourceKey, record.transport);
      this.emit(context, { channel: 'lifecycle', source: 'plugin', severity: 'info', name: 'session.bound', payload: { via: record.method } });
      return;
    }
    // Non-turn responses stay unstored (bounded collection; see recordRequest).
  }

  private recordNotification(record: DshWireRecord): void {
    if (record.method !== 'session/update' || !record.sessionId) {
      this.emit(this.runtimeContext(record.transport), { channel: 'lifecycle', source: 'plugin', severity: 'debug', name: 'config.extensions_updated', payload: { bytes: record.bytes } });
      return;
    }
    const context = this.bindSession(record.sessionId, this.sourceKeyOf(record), record.transport);
    const sessionUpdate = normalizeSessionUpdate(record.sessionUpdate);
    const name = DELTA_SESSION_UPDATES.has(sessionUpdate) ? `update.${sessionUpdate}.delta` : `update.${sessionUpdate}`;
    const detail = this.sanitizeWireDetail(record.detail);
    const severity: TraceSeverity = sessionUpdate === 'tool_call_update' && detail?.status === 'failed' ? 'warning' : 'debug';
    this.emit(context, { channel: 'stream-sync', source: 'harness', severity: severity, name: name, payload: {
      ...detail,
      ...(typeof record.backendTimeMs === 'number' && Number.isFinite(record.backendTimeMs) ? { backendTimeMs: record.backendTimeMs } : {}),
    } });
  }

  /**
   * Second-layer intake whitelist applied at the service boundary: the client
   * extractor already forwards only whitelisted metadata, but the trace owner
   * must not trust that. Unknown keys are dropped (never dumped into detail),
   * enum fields must carry protocol enum values, strings are bounded
   * identifiers, numbers must be finite — then credential-shaped runs are
   * scrubbed again as defense in depth.
   */
  private sanitizeWireDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!detail) return undefined;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(detail)) {
      if (WIRE_DETAIL_STRING_KEYS.has(key) && typeof value === 'string' && value.length <= WIRE_DETAIL_STRING_MAX) {
        if (WIRE_DETAIL_ENUM_KEYS.has(key)) {
          const allowed = key === 'kind' ? WIRE_TOOL_KINDS : WIRE_TOOL_STATUSES;
          if (!allowed.has(value)) continue;
        } else if (key === 'sessionUpdate' && !SESSION_UPDATE_PATTERN.test(value)) {
          continue;
        }
        result[key] = scrubCredentialShapes(value);
      } else if (WIRE_DETAIL_NUMBER_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private recordClientNotification(record: DshWireRecord): void {
    if (record.method === 'session/cancel' && record.sessionId) {
      const context = this.bindSession(record.sessionId, this.sourceKeyOf(record), record.transport);
      this.emit(context, { channel: 'lifecycle', source: 'plugin', severity: 'info', name: 'turn.cancel_requested', payload: {} });
      return;
    }
    // Other client notifications stay unstored (bounded collection).
  }

  private recordServerRequest(record: DshWireRecord): void {
    const sourceKey = this.sourceKeyOf(record);
    if (record.requestId !== undefined) {
      this.serverRequestMethods.set(`${sourceKey}#${String(record.requestId)}`, record.method ?? '');
      this.evictMapOldest(this.serverRequestMethods, MAX_SERVER_REQUEST_METHODS);
    }
    const interactionName = record.method === 'session/request_permission'
      ? 'permission.request'
      : record.method === 'session/request_question'
        ? 'question.request'
        : undefined;
    if (!interactionName || !record.sessionId) {
      // Non-interaction server requests stay unstored (bounded collection).
      return;
    }
    const context = this.bindSession(record.sessionId, sourceKey, record.transport);
    this.emit(context, { channel: 'tool-interaction', source: 'harness', severity: 'info', name: interactionName, payload: this.sanitizeWireDetail(record.detail) ?? {} });
  }

  private recordServerReply(record: DshWireRecord): void {
    const sourceKey = this.sourceKeyOf(record);
    const replyKey = record.requestId !== undefined ? `${sourceKey}#${String(record.requestId)}` : undefined;
    const method = replyKey !== undefined ? this.serverRequestMethods.get(replyKey) : undefined;
    if (replyKey !== undefined) this.serverRequestMethods.delete(replyKey);
    if (method === 'session/request_permission') {
      this.emit(this.runtimeContext(record.transport), { channel: 'tool-interaction', source: 'plugin', severity: 'info', name: 'permission.reply', payload: {
        outcome: record.ok === false ? 'error' : 'answered',
        requestId: record.requestId,
      } });
      return;
    }
    // Non-permission replies stay unstored (bounded collection).
  }

  private recordConnection(record: DshWireRecord): void {
    const sourceKey = this.sourceKeyOf(record);
    const isSourceCarrying = record.sourceId !== undefined && record.generation !== undefined;
    const enabled = this.isEnabled(record.transport);
    if (record.method === 'closed' || record.method === 'error') {
      // Only registered (known) sources or legacy keys can be dead-marked: an
      // unknown source cannot create tombstones, so floods cannot grow the set.
      if (isSourceCarrying && !this.knownSources.has(sourceKey)) return;
      // Dead-marking and the bounded in-memory cleanups are gate-independent
      // lifecycle metadata; the event rows and turn failures stay gated.
      this.deadSources.add(sourceKey);
      this.dropSourceSessionContexts(sourceKey);
      this.dropSourceServerRequests(sourceKey);
      if (!enabled) return;
      const errorKind = record.error !== undefined && WIRE_ERROR_KINDS.has(record.error) ? record.error : undefined;
      this.emit(this.runtimeContext(record.transport), { channel: 'lifecycle', source: 'plugin', severity: 'error', name: `connection.${record.method}`, payload: {
        ...(errorKind !== undefined ? { kind: errorKind } : {}),
      } });
      this.failOpenTurns(sourceKey, record.method);
      return;
    }
    if (!this.acceptSourceConnection(record, sourceKey)) return;
    this.deadSources.delete(sourceKey);
    if (!enabled) return;
    const method = record.method === 'starting' || record.method === 'connected' ? record.method : 'changed';
    this.emit(this.runtimeContext(record.transport), { channel: 'lifecycle', source: 'plugin', severity: 'info', name: `connection.${method}`, payload: this.sanitizeWireDetail(record.detail) ?? {} });
  }

  /** Admit an active source or register a fresh start without discarding protection state. */
  private acceptSourceConnection(record: DshWireRecord, sourceKey: string): boolean {
    if (record.sourceId === undefined || record.generation === undefined) return true;
    if (record.method !== 'starting') return this.knownSources.has(sourceKey) && !this.deadSources.has(sourceKey);
    if (this.deadSources.has(sourceKey)) return false;
    if (this.knownSources.has(sourceKey)) return true;
    if (this.knownSources.size >= MAX_SOURCE_REGISTRATIONS) {
      this.notifySourceRegistryFull(record.transport);
      return false;
    }
    this.knownSources.add(sourceKey);
    return true;
  }

  /** One-shot runtime marker when the source registry is full; new sources stay untraced. */
  private notifySourceRegistryFull(transport: DshTransportId): void {
    if (this.sourceRegistryFullNotified) return;
    this.sourceRegistryFullNotified = true;
    this.emit(this.runtimeContext(transport), { channel: 'lifecycle', source: 'plugin', severity: 'warning', name: 'trace.source_registry_limit', payload: { limit: MAX_SOURCE_REGISTRATIONS } });
  }

  /** Fails the open turns of exactly one source; durations stay unknown. */
  private failOpenTurns(sourceKey: string, reason: string): void {
    for (const [turnKey, open] of [...this.openTurns]) {
      if (open.sourceKey !== sourceKey) continue;
      this.openTurns.delete(turnKey);
      const context = this.bindSession(open.sessionId, open.sourceKey, open.transport, open.requestId);
      this.emit(context, { channel: 'lifecycle', source: 'plugin', severity: 'warning', name: 'turn.finished', payload: {
        state: 'incomplete',
        reason,
      } });
    }
  }

  // ---- internals ----

  /** `sourceId@generation` for source-carrying records, `legacy@transport` otherwise. */
  private sourceKeyOf(record: DshWireRecord): string {
    return record.sourceId !== undefined && record.generation !== undefined
      ? `${record.sourceId}@${record.generation}`
      : `legacy@${record.transport}`;
  }

  private bindSession(sessionId: string, sourceKey: string, transport: DshTransportId, turnRequestId?: number): DshTraceContext {
    const key = `${sourceKey}|${sessionId}`;
    const existing = this.sessions.get(key);
    if (existing) return { ...existing, turnRequestId };
    const context: DshTraceContext = {
      traceId: this.sessionTraceId(sourceKey, sessionId),
      runtimeSegmentId: this.runtimeSegmentId,
      sessionId,
      transport,
      ...(sourceKey.startsWith('legacy@') ? {} : { wireSource: sourceKey }),
      ...(turnRequestId !== undefined ? { turnRequestId } : {}),
    };
    this.sessions.set(key, context);
    this.evictMapOldest(this.sessions, MAX_SESSION_BINDINGS);
    // Enable first: a store constructed while every gate was off swallows
    // bindSession silently, which used to leave resolveTraceId undefined and
    // the whole ledger dead after the settings toggle flipped on.
    this.store.enable();
    this.store.bindSession(sessionId, context.traceId);
    return context;
  }

  /**
   * Session trace ids are stable per client instance and session id: two
   * concurrent clients that somehow report the same session id never merge,
   * while a restarted client resuming its own session continues its trace.
   */
  private sessionTraceId(sourceKey: string, sessionId: string): string {
    if (sourceKey.startsWith('legacy@')) return this.stableTraceId(sessionId);
    return `dsh-${createHash('sha256').update(`${sourceKey}:${sessionId}`).digest('hex').slice(0, 32)}`;
  }

  /** Drops the cached binding contexts of one source (the store index persists). */
  private dropSourceSessionContexts(sourceKey: string): void {
    for (const [key, context] of [...this.sessions]) {
      if (context.wireSource === sourceKey) this.sessions.delete(key);
    }
  }

  private dropSourceServerRequests(sourceKey: string): void {
    const prefix = `${sourceKey}#`;
    for (const key of [...this.serverRequestMethods.keys()]) {
      if (key.startsWith(prefix)) this.serverRequestMethods.delete(key);
    }
  }

  private runtimeContext(transport: DshTransportId): DshTraceContext {
    return { traceId: this.runtimeSegmentId, runtimeSegmentId: this.runtimeSegmentId, transport };
  }

  private stableTraceId(sessionId: string): string {
    return `dsh-${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}`;
  }

  private isEnabled(transport: DshTransportId): boolean {
    try {
      const settings = this.options.settings();
      return transport === 'native' ? settings.nativeEnabled : settings.acpEnabled;
    } catch {
      return false;
    }
  }

  private emit(context: DshTraceContext, draft: DshTraceEventDraft): void {
    const { channel, source, severity, name, payload, metrics } = draft;
    try {
      if (!this.isEnabled(context.transport)) return;
      this.store.enable();
      if (this.globalCaptureStopped) return;
      if (this.totalCapturedEvents >= MAX_TOTAL_CAPTURE_EVENTS) {
        // Service-wide capture budget reached: one marker in the runtime
        // segment, then all collection stops, so long-running processes can
        // never inflate storage through endless new traces.
        this.globalCaptureStopped = true;
        this.appendEvent(this.runtimeContext(context.transport), { channel: 'lifecycle', source: 'plugin', severity: 'warning', name: 'trace.capture_limit', payload: { limit: MAX_TOTAL_CAPTURE_EVENTS } });
        return;
      }
      const budget = this.traceBudget(context);
      // Never evict protection state or re-open a trace after it reached a cap.
      if (!budget || budget.limited) return;
      if (budget.count >= MAX_EVENTS_PER_TRACE) {
        budget.limited = true;
        this.appendEvent(context, { channel: 'lifecycle', source: 'plugin', severity: 'warning', name: 'trace.session_limit', payload: { limit: MAX_EVENTS_PER_TRACE } });
        return;
      }
      budget.count += 1;
      this.appendEvent(context, {
        channel,
        source,
        severity,
        name,
        payload,
        ...(metrics !== undefined ? { metrics } : {}),
      });
    } catch {
      // Diagnostics must never affect the DSH chat path.
    }
  }

  /**
   * Per-trace budget lookup. New budgets are seeded from the store's in-memory
   * summary index (no large file reads) so a trace carried over from an earlier
   * instance cannot grow past its budget again; a missed seed only delays
   * accounting, and the oversize read guard in readSessionLedger stays the
   * hard read bound. The map itself is never evicted: when it is full, new
   * traces are refused fail-closed instead of letting an already-capped trace
   * silently restart its count.
   */
  private traceBudget(context: DshTraceContext): { count: number; limited: boolean } | undefined {
    let budget = this.traceBudgets.get(context.traceId);
    if (!budget) {
      if (this.traceBudgets.size >= MAX_BUDGET_ENTRIES) { this.budgetRegistryFull = true; return undefined; }
      budget = { count: 0, limited: false };
      const summary = this.store.listSummaries(Number.MAX_SAFE_INTEGER).find((entry) => entry.traceId === context.traceId);
      if (summary && summary.eventCount > 0) {
        budget.count = Math.min(summary.eventCount, MAX_EVENTS_PER_TRACE);
        budget.limited = summary.eventCount >= MAX_EVENTS_PER_TRACE;
      }
      this.traceBudgets.set(context.traceId, budget);
    }
    return budget;
  }

  private appendEvent(context: DshTraceContext, draft: DshTraceEventDraft): void {
    try {
      // Markers included: every append counts toward the service-wide budget.
      this.totalCapturedEvents += 1;
      const redacted = draft.payload === undefined ? undefined : this.redactor.redact(draft.payload);
      const event: DshTraceEventV1 = {
        schemaVersion: DSH_TRACE_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        monotonicSequence: ++this.sequence,
        traceId: context.traceId,
        runtimeSegmentId: context.runtimeSegmentId,
        sessionId: context.sessionId,
        transport: context.transport,
        ...(context.turnRequestId !== undefined ? { turnRequestId: context.turnRequestId } : {}),
        ...(context.wireSource !== undefined ? { wireSource: context.wireSource } : {}),
        channel: draft.channel,
        source: draft.source,
        severity: draft.severity,
        name: draft.name,
        metrics: {
          ...(redacted ? { redactedSecrets: redacted.stats.secretsRemoved } : {}),
          ...draft.metrics,
        },
        payload: redacted?.value,
        payloadRef: { kind: 'inline' },
      };
      this.store.append(event);
      this.mirrorToConsole(event);
    } catch {
      // Console failure is diagnostics-only.
    }
  }

  private evictMapOldest<K, V>(map: Map<K, V>, limit: number): void {
    while (map.size > limit) {
      const oldest = map.keys().next();
      if (oldest.done) return;
      map.delete(oldest.value);
    }
  }

  private mirrorToConsole(event: DshTraceEventV1): void {
    try {
      const settings = this.options.settings();
      const always = event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error';
      if (!always && settings.consolePreset !== 'full') return;
      if (!always && !settings.consoleChannels[event.channel]) return;
      const line = `[dsh-trace] ${event.severity} ${event.channel}/${event.name}`;
      if (always) logger.warn(line, event.payload ?? '');
      else logger.debug(line, event.payload ?? '');
    } catch {
      // Console failure is diagnostics-only.
    }
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

function extractDshTraceMetadata(events: DshTraceEventV1[]): string[] {
  const sessions = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const turns = events.filter((event) => event.name === 'turn.started').length;
  const finished = events.filter((event) => event.name === 'turn.finished');
  // `response-received` is a client-observed receipt, not proof of completion;
  // only explicit RPC errors count as errors here.
  const errors = finished.filter((event) => firstString((event.payload ?? {}) as Record<string, unknown>, ['state']) === 'error');
  const roundTrips = finished
    .map((event) => event.metrics?.clientRoundTripMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const redactedSecrets = events.reduce((sum, event) => sum + (event.metrics?.redactedSecrets ?? 0), 0);
  return [
    `Sessions: ${sessions.size}`,
    `Turns observed: ${turns}`,
    `Turns finished: ${finished.length}`,
    `Turn errors: ${errors.length}`,
    roundTrips.length > 0
      ? `Client round trips (ms): last ${roundTrips[roundTrips.length - 1]}, max ${Math.max(...roundTrips)}`
      : 'Client round trips: none observed',
    `Redacted secrets: ${redactedSecrets}`,
  ];
}
