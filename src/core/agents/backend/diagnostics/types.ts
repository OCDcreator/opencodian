import type { TraceEventBase, TraceTerminalState } from '../../../../shared/diagnostics';

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
  bindThread(input: { threadId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'app-server' | 'sdk'; payload?: unknown }): CodexTraceContext;
  beginTurn(input: { threadId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: CodexDiagnosticRunToken; payload?: unknown }): CodexTraceContext;
  recordTurnNotification(context: CodexTraceContext, method: string, payload?: unknown): void;
  recordStreamSync(context: CodexTraceContext | undefined, name: string, severity: 'debug' | 'info' | 'warning', payload?: unknown): void;
  recordToolInteraction(context: CodexTraceContext | undefined, name: string, payload?: unknown): void;
  recordLifecycle(name: string, payload?: unknown): void;
  recordWireEvent(record: CodexWireRecord): void;
  recordServiceOutput(stream: 'stdout' | 'stderr', text: string): void;
  finishTurn(context: CodexTraceContext, state: TraceTerminalState, payload?: unknown): void;
  markAnomaly(context: CodexTraceContext | undefined, name: string, severity: 'warning' | 'critical' | 'error', payload?: unknown): void;
  armDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken;
  cancelDeepCapture(tabId: string): boolean;
  claimDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken | undefined;
  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing';
}
