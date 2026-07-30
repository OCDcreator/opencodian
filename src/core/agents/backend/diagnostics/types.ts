import type { TraceEventBase, TraceTerminalState } from '../../../../shared/diagnostics';
import type { CodexAppServerWireObserver } from '../CodexAppServerClientTypes';

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
