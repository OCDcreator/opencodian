export type TraceSeverity = 'debug' | 'info' | 'warning' | 'critical' | 'error';
export type TraceTerminalState = 'completed' | 'cancelled' | 'error' | 'incomplete';

export interface TracePayloadRef {
  kind: 'inline' | 'deep';
  runId?: string;
}

/** Fields the shared store/report builder rely on. Backends extend this with typed channel/source and their own id fields. */
export interface TraceEventBase {
  schemaVersion: number;
  timestamp: string;
  monotonicSequence: number;
  traceId: string;
  runtimeSegmentId: string;
  runId?: string;
  rootSessionId?: string;
  parentSessionId?: string;
  /** Generic conversation anchor. OpenCode: sessionId. Codex: threadId. */
  sessionId?: string;
  sourceEventId?: string;
  channel: string;
  source: string;
  severity: TraceSeverity;
  name: string;
  metrics?: Record<string, number>;
  payload?: unknown;
  payloadRef?: TracePayloadRef;
}

export interface TraceSummary {
  traceId: string;
  sessionId?: string;
  lastUpdatedAt: string;
  eventCount: number;
  runCount: number;
  highestSeverity: TraceSeverity;
  highestUnreadSeverity?: TraceSeverity;
  unreadAnomalyCount: number;
  deepCaptureCount: number;
}

export interface TraceStoreStatus {
  mode: 'disk' | 'memory';
  rootDirectory: string;
  queuedEvents: number;
  approximateBytes: number;
  lastError?: string;
  droppedEvents: number;
}
