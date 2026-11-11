import type { TraceEventBase, TraceReportBuilder, TraceSeverity, TraceStore, TraceStoreStatus, TraceSummary, TraceTerminalState } from '../../../../shared/diagnostics';
import type { CodexAppServerWireObserver } from '../codex/CodexAppServerClientTypes';
/** Which DSH carrier a client instance speaks; set by the app wiring factory. */
export type DshTransportId = 'native' | 'acp';

/** Fixed wire-failure classification tokens. Trace records never carry free-form error text. */
export const DSH_WIRE_ERROR_KINDS = ['rpc-error', 'timeout', 'protocol-failure', 'transport-closed', 'server-reply-error'] as const;
export type DshWireErrorKind = typeof DSH_WIRE_ERROR_KINDS[number];

/** Whitelisted ACP tool metadata enums; only these values may enter a trace. */
export const DSH_TOOL_KIND_VALUES = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'other'] as const;
export const DSH_TOOL_STATUS_VALUES = ['pending', 'in_progress', 'completed', 'failed'] as const;
/** Strict ACP session/prompt stopReason enum; unknown values are never traced. */
export const DSH_STOP_REASON_VALUES = ['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'] as const;
export type DshStopReason = typeof DSH_STOP_REASON_VALUES[number];

/**
 * Whitelisted wire-level trace record. Carries only envelope metadata,
 * lifecycle, and timing — never raw prompt, credential, configuration,
 * stderr, or error-message payloads. The transport whitelists each `detail`
 * field before observation and the trace service whitelists again on intake.
 */
export interface DshWireRecord {
  direction: 'out' | 'in';
  kind: 'request' | 'response' | 'notification' | 'client-notification' | 'server-request' | 'server-reply' | 'connection';
  method?: string;
  requestId?: number | string;
  sessionId?: string;
  /** `session/update.sessionUpdate` discriminator, when applicable. */
  sessionUpdate?: string;
  ok?: boolean;
  /** Client-observed round trip (request write → response parse) in ms. */
  durationMs?: number;
  bytes: number;
  transport: DshTransportId;
  /** Backend-native event time in epoch ms, only when the update envelope carried one. */
  backendTimeMs?: number;
  /** Whitelisted metadata only; never prompt/tool raw input, title text, or config values. */
  detail?: Record<string, unknown>;
  /** Fixed classification token from DSH_WIRE_ERROR_KINDS — never free-form error text. */
  error?: string;
  /** Numeric JSON-RPC error code for failed responses, when present. */
  errorCode?: number;
  /**
   * Unique id of the client instance that produced this record; set by
   * `DshAcpClient` so concurrent main/aux or old/new clients can never share
   * pending-turn, lifecycle, or pairing state. Absent on legacy hand-built records.
   */
  sourceId?: string;
  /** Client-local launch generation; increments on every start of the same instance. */
  generation?: number;
  /** Strict ACP stopReason for a session/prompt response, when the result carried one. */
  stopReason?: string;
}

/** Duck-typed trace sink implemented by the diagnostics session-trace service. */
export interface DshAcpWireObserver {
  recordWireEvent(record: DshWireRecord): void;
}

/** Atomic trace injection for a constructed client; absent means zero trace hooks. */
export interface DshClientTraceHook {
  readonly observer: DshAcpWireObserver;
  readonly transport: DshTransportId;
}

export const CLAUDE_TRACE_SCHEMA_VERSION = 1 as const;
export const CLAUDE_TRACE_CHANNEL_IDS = ['lifecycle', 'stream-sync', 'tool-interaction', 'persistence-recovery', 'service-output'] as const;
export type ClaudeTraceChannelId = typeof CLAUDE_TRACE_CHANNEL_IDS[number];
export type ClaudeTraceSource = 'plugin' | 'sdk' | 'cli' | 'storage';

export interface ClaudeTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof CLAUDE_TRACE_SCHEMA_VERSION;
  channel: ClaudeTraceChannelId;
  source: ClaudeTraceSource;
  turnId?: string;
  messageUuid?: string;
  partId?: string;
  toolUseId?: string;
}

export interface ClaudeTraceContext {
  traceId: string;
  runtimeSegmentId: string;
  sessionId?: string;
  conversationId?: string;
  tabId?: string;
  turnId?: string;
  runId?: string;
  deepCapture?: boolean;
}

export interface ClaudeDiagnosticRunToken {
  runId: string;
  tabId: string;
  armedAt: number;
  expiresAt: number;
}

export interface ClaudeSessionTraceSettings {
  enabled: boolean;
  consolePreset: 'off' | 'standard' | 'full';
  consoleChannels: Record<ClaudeTraceChannelId, boolean>;
  storageDirectory: string;
}

/** Redacted SDK payload retained only in the bounded retroactive trace ring. */
export interface ClaudeSdkTraceRecord {
  type: string;
  subtype?: string;
  uuid?: string;
  partId?: string;
  toolUseId?: string;
  bytes: number;
  payload: unknown;
}

export interface ClaudeTracePort {
  bindSession(input: { sessionId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'sdk' | 'cli'; payload?: unknown }): ClaudeTraceContext;
  beginTurn(input: { sessionId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: ClaudeDiagnosticRunToken; payload?: unknown; provisional?: boolean }): ClaudeTraceContext;
  recordSdkMessage(context: ClaudeTraceContext | undefined, message: unknown): void;
  recordNormalizedChunk(context: ClaudeTraceContext | undefined, chunkType: string, chunk?: unknown): void;
  recordTurnEvent(context: ClaudeTraceContext | undefined, name: string, severity?: 'debug' | 'info' | 'warning' | 'critical' | 'error', payload?: unknown): void;
  finishTurn(context: ClaudeTraceContext, state: TraceTerminalState, payload?: unknown): void;
  recordLifecycle(name: string, payload?: unknown): void;
  recordPermission(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void;
  recordElicitation(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void;
  recordPersistence(context: ClaudeTraceContext | undefined, operation: string, payload?: unknown): void;
  armDeepCapture(tabId: string, sessionId?: string): ClaudeDiagnosticRunToken;
  claimDeepCapture(tabId: string, sessionId?: string): ClaudeDiagnosticRunToken | undefined;
  cancelDeepCapture(tabId: string): boolean;
  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing';
  flushRingBuffer(sessionId: string | undefined, reason: string): void;
  resolveTraceId(sessionId: string | undefined): string | undefined;
  buildSmartReport(traceId?: string, userContext?: { actual?: string; expected?: string; reproduction?: string }, options?: { selection?: 'automatic' | 'current-session' }): Promise<string>;
  exportTrace(traceId: string, targetDirectory: string): Promise<string | undefined>;
  clearAll(): Promise<void>;
  getStorageStatus(): import('../../../../shared/diagnostics').TraceStoreStatus;
  listRecentTraces(limit?: number): import('../../../../shared/diagnostics').TraceSummary[];
}

export const CODEX_TRACE_SCHEMA_VERSION = 1 as const;
export const CODEX_TRACE_CHANNEL_IDS = ['lifecycle', 'transport', 'stream-sync', 'tool-interaction', 'service-output'] as const;
export type CodexTraceChannelId = typeof CODEX_TRACE_CHANNEL_IDS[number];
export type CodexTraceSource = 'plugin' | 'app-server' | 'cli' | 'storage';
export interface CodexTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof CODEX_TRACE_SCHEMA_VERSION;
  channel: CodexTraceChannelId;
  source: CodexTraceSource;
  turnId?: string;
  itemId?: string;
}
export interface CodexTraceContext {
  traceId: string;
  runtimeSegmentId: string;
  runId?: string;
  threadId?: string;
  turnId?: string;
  conversationId?: string;
  tabId?: string;
  deepCapture?: boolean;
}
export interface CodexDiagnosticRunToken { runId: string; tabId: string; armedAt: number; expiresAt: number; }
export interface CodexSessionTraceSettings {
  enabled: boolean;
  consolePreset: 'standard' | 'full';
  consoleChannels: Record<CodexTraceChannelId, boolean>;
  storageDirectory: string;
  captureContent: boolean;
}
export interface CodexWireRecord {
  direction: 'out' | 'in';
  kind: 'request' | 'response' | 'notification' | 'server-request' | 'server-reply' | 'connection';
  method?: string;
  requestId?: number | string;
  threadId?: string;
  ok?: boolean;
  durationMs?: number;
  bytes: number;
  payload?: unknown;
}
export interface CodexTracePort {
  /**
   * Duck-typed wire observer fed into `CodexAppServerTransport`. When a
   * `CodexSessionTraceService` is the port, this is its public
   * `wireBridge: CodexWireTraceBridge`, which structurally satisfies
   * `CodexAppServerWireObserver` (all six methods). Optional and
   * optional-chained by the adapter so a port without one is a no-op.
   */
  readonly wireBridge?: CodexAppServerWireObserver;
  bindThread(input: { threadId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'app-server' | 'sdk'; payload?: unknown }): CodexTraceContext;
  beginTurn(input: { threadId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: CodexDiagnosticRunToken; payload?: unknown }): CodexTraceContext;
  recordTurnNotification(context: CodexTraceContext, method: string, payload?: unknown): void;
  recordStreamSync(context: CodexTraceContext | undefined, name: string, severity: 'debug' | 'info' | 'warning', payload?: unknown): void;
  recordToolInteraction(context: CodexTraceContext | undefined, name: string, payload?: unknown): void;
  recordLifecycle(name: string, payload?: unknown): void;
  recordWireEvent(record: CodexWireRecord): void;
  recordServiceOutput(stream: 'stdout' | 'stderr', text: string): void;
  flushRingBuffer(threadId: string | undefined, reason: string): void;
  finishTurn(context: CodexTraceContext, state: TraceTerminalState, payload?: unknown): void;
  markAnomaly(context: CodexTraceContext | undefined, name: string, severity: 'warning' | 'critical' | 'error', payload?: unknown): void;
  armDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken;
  cancelDeepCapture(tabId: string): boolean;
  claimDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken | undefined;
  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing';
}

// ---- DSH (DeepSeek Harness) wire trace ----
// Narrowed contract: metadata/lifecycle/timing only. Raw prompt, credential,
// and configuration payloads are never forwarded by the client hook and never
// stored by the service; there is no deep-capture or content-capture surface
// for DSH in this schema. Durations are client-observed round trips (request
// write → response parse) and are always labeled as such — model execution
// time has no trace source and is never fabricated.

export const DSH_TRACE_SCHEMA_VERSION = 1 as const;
export const DSH_TRACE_CHANNEL_IDS = ['lifecycle', 'transport', 'stream-sync', 'tool-interaction'] as const;
export type DshTraceChannelId = typeof DSH_TRACE_CHANNEL_IDS[number];
export type DshTraceSource = 'plugin' | 'harness' | 'storage';

export interface DshTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof DSH_TRACE_SCHEMA_VERSION;
  channel: DshTraceChannelId;
  source: DshTraceSource;
  transport: DshTransportId;
  /** Client request id of the `session/prompt` turn this event belongs to, when known. */
  turnRequestId?: number;
  /** Composite `sourceId@generation` of the observing client, when the record carried one. */
  wireSource?: string;
}

export interface DshTraceContext {
  traceId: string;
  runtimeSegmentId: string;
  sessionId?: string;
  transport: DshTransportId;
  turnRequestId?: number;
  /** Composite `sourceId@generation` for session-scoped contexts, when source-keyed. */
  wireSource?: string;
}

export interface DshSessionTraceSettings {
  /** Wire trace gate for Harness native-transport clients. */
  nativeEnabled: boolean;
  /** Wire trace gate for ACP-transport clients. Independent from nativeEnabled. */
  acpEnabled: boolean;
  consolePreset: 'standard' | 'full';
  consoleChannels: Record<DshTraceChannelId, boolean>;
  storageDirectory: string;
}

/** Whitelisted ledger row projected from stored trace events for the context UI. */
export interface DshTraceLedgerEntry {
  /** ISO timestamp captured client-side when the event was observed. */
  timestamp: string;
  /** Where the timestamp came from: `backend` when the update envelope carried a native time, else `client`. */
  timeSource: 'backend' | 'client';
  /** Stable ledger event name, e.g. `turn.started`, `update.tool_call`. */
  name: string;
  /** Short metadata-only description; never raw prompt/tool content. */
  detail?: string;
  /** Client-observed duration in ms. Absent when never observed — never synthesized. */
  durationMs?: number;
  /** What the duration measures. Present only alongside durationMs. */
  durationKind?: 'client-round-trip' | 'transport' | 'observed-tool-span';
  severity?: TraceSeverity;
}

export interface DshTraceLedgerSnapshot {
  entries: DshTraceLedgerEntry[];
  /** True when the per-session capture budget was hit and later events were not recorded. */
  limited?: boolean;
  timing: {
    /** Client-observed round trip of the last finished prompt turn. Undefined when no turn finished. */
    lastTurnClientRoundTripMs?: number;
    observedTurnCount: number;
    eventCount: number;
    /** ISO time of the newest observed event. Undefined for an empty ledger. */
    lastEventAt?: string;
  };
}

export interface DshTracePort extends DshAcpWireObserver {
  /** Stable trace id for a DSH session id, without requiring a bound session. */
  resolveTraceId(sessionId: string | undefined): string | undefined;
  /** Projects the stored session trace into the whitelisted ledger snapshot for the context UI. */
  readSessionLedger(sessionId: string): Promise<DshTraceLedgerSnapshot | null>;
  readonly store: TraceStore<DshTraceEventV1>;
  readonly reportBuilder: TraceReportBuilder<DshTraceEventV1>;
  buildSmartReport(traceId?: string, userContext?: { actual?: string; expected?: string; reproduction?: string }, options?: { selection?: 'automatic' | 'current-session' }): Promise<string>;
  exportTrace(traceId: string, targetDirectory: string): Promise<string | undefined>;
  clearAll(): Promise<void>;
  getStorageStatus(): TraceStoreStatus;
  listRecentTraces(limit?: number): TraceSummary[];
  dispose(): Promise<void>;
}
