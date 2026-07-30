import type { TraceEventBase, TraceSeverity, TraceStoreStatus, TraceSummary, TraceTerminalState } from '../../../shared/diagnostics/types';

export const OPEN_CODE_TRACE_SCHEMA_VERSION = 1 as const;

export const OPEN_CODE_TRACE_CHANNEL_IDS = [
  'lifecycle',
  'transport',
  'stream-sync',
  'tool-interaction',
  'persistence-recovery',
  'service-output',
] as const;

export type OpenCodeTraceChannelId = typeof OPEN_CODE_TRACE_CHANNEL_IDS[number];
export type OpenCodeTraceSeverity = TraceSeverity;
export type OpenCodeTraceSource = 'plugin' | 'sdk' | 'http' | 'sse' | 'server' | 'storage';
export type OpenCodeTraceTerminalState = TraceTerminalState;

export interface OpenCodeTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof OPEN_CODE_TRACE_SCHEMA_VERSION;
  channel: OpenCodeTraceChannelId;
  source: OpenCodeTraceSource;
  messageId?: string;
  partId?: string;
  callId?: string;
  requestId?: string;
}

export interface OpenCodeDiagnosticRunToken {
  runId: string;
  tabId: string;
  armedAt: number;
  expiresAt: number;
}

export interface OpenCodeTraceContext {
  traceId: string;
  runtimeSegmentId: string;
  runId?: string;
  rootSessionId?: string;
  parentSessionId?: string;
  sessionId?: string;
  deepCapture?: boolean;
  tabId?: string;
  childDepth?: number;
}

export interface OpenCodeTraceEventLink {
  sourceEventId?: string;
  messageId?: string;
  partId?: string;
  callId?: string;
  requestId?: string;
  metrics?: Record<string, number>;
}

export interface OpenCodeBootstrapContext extends OpenCodeTraceContext {
  bootstrapId: string;
}

export interface OpenCodeTracePort {
  beginBootstrap(payload?: unknown): OpenCodeBootstrapContext;
  bindSession(context: OpenCodeBootstrapContext, sessionId: string): OpenCodeTraceContext;
  beginRun(input: {
    sessionId: string;
    model?: string;
    provider?: string;
    messageId?: string;
    prompt?: string;
    diagnosticRunToken?: OpenCodeDiagnosticRunToken;
  }): OpenCodeTraceContext;
  recordIngress(
    context: OpenCodeTraceContext,
    name: string,
    payload?: unknown,
    link?: OpenCodeTraceEventLink,
  ): void;
  recordNormalized(
    context: OpenCodeTraceContext,
    name: string,
    payload?: unknown,
    link?: OpenCodeTraceEventLink,
  ): void;
  linkChildSession(
    context: OpenCodeTraceContext,
    childSessionId: string,
    payload?: { depth?: number; relation?: string },
  ): OpenCodeTraceContext;
  finishRun(
    context: OpenCodeTraceContext,
    state: OpenCodeTraceTerminalState,
    payload?: unknown,
  ): void;
  markAnomaly(
    context: OpenCodeTraceContext,
    name: string,
    severity: Extract<OpenCodeTraceSeverity, 'warning' | 'critical' | 'error'>,
    payload?: unknown,
  ): void;
  recordSdkCall?(input: {
    context?: OpenCodeTraceContext;
    path: string;
    args: unknown[];
    durationMs: number;
    result?: unknown;
    error?: unknown;
  }): void;
  recordTransport?(input: {
    context?: OpenCodeTraceContext;
    method: string;
    url: string;
    status?: number;
    durationMs: number;
    requestId?: string;
    error?: unknown;
  }): void;
  recordRuntime?(input: {
    channel: OpenCodeTraceChannelId;
    source: OpenCodeTraceSource;
    severity: OpenCodeTraceSeverity;
    name: string;
    payload?: unknown;
  }): void;
  recordServiceOutput?(input: {
    stream: 'stdout' | 'stderr';
    text: string;
    pid?: number;
  }): void;
  recordReconnect?(input: {
    context?: OpenCodeTraceContext;
    name: string;
    severity: OpenCodeTraceSeverity;
    payload?: unknown;
  }): void;
  recordSessionIngress?(
    sessionId: string,
    name: string,
    payload?: unknown,
    context?: OpenCodeTraceContext,
    link?: OpenCodeTraceEventLink,
  ): void;
  recordSessionNormalized?(
    sessionId: string,
    name: string,
    payload?: unknown,
    context?: OpenCodeTraceContext,
    link?: OpenCodeTraceEventLink,
  ): void;
  finishActiveSessionRun?(sessionId: string, state: OpenCodeTraceTerminalState, payload?: unknown): void;
}

export type OpenCodeTraceSummary = TraceSummary;

export type OpenCodeTraceStoreStatus = TraceStoreStatus;
