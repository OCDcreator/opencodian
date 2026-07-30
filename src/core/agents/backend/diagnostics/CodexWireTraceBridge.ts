import type { CodexSessionTraceService } from './CodexSessionTraceService';
import type { CodexWireRecord } from './types';

/**
 * Local stand-in for the wire observer contract that Task 7 will define in
 * `../CodexAppServerClientTypes`. Kept here so the bridge compiles before that
 * module grows the observer hook; Task 7 reconciles the two declarations.
 */
export interface CodexAppServerWireObserver {
  onRequest?(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void;
  onResponse?(input: { id: number; ok: boolean; durationMs: number; error?: string }): void;
  onNotification?(input: { method: string; params: unknown }): void;
  onServerRequest?(input: { id: number | string; method: string; params: unknown }): void;
  onServerReply?(input: { id: number | string; ok: boolean }): void;
  onConnection?(input: { state: 'starting' | 'ws-url' | 'connected' | 'initialized' | 'closed' | 'error' | 'stopped'; detail?: unknown }): void;
}

function byteSize(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function threadIdOf(params: unknown): string | undefined {
  if (params && typeof params === 'object' && typeof (params as { threadId?: unknown }).threadId === 'string') {
    return (params as { threadId: string }).threadId;
  }
  return undefined;
}

/** Feeds raw wire traffic into the trace service (envelope) and the retroactive ring buffer (raw). */
export class CodexWireTraceBridge implements CodexAppServerWireObserver {
  constructor(private readonly service: CodexSessionTraceService) {}

  onRequest(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void {
    this.emit({ direction: 'out', kind: 'request', method: input.method, requestId: input.id, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onResponse(input: { id: number; ok: boolean; durationMs: number; error?: string }): void {
    this.emit({ direction: 'in', kind: 'response', requestId: input.id, ok: input.ok, durationMs: input.durationMs, bytes: byteSize(input.error), payload: input.error ? { error: input.error } : undefined });
  }

  onNotification(input: { method: string; params: unknown }): void {
    this.emit({ direction: 'in', kind: 'notification', method: input.method, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onServerRequest(input: { id: number | string; method: string; params: unknown }): void {
    this.emit({ direction: 'in', kind: 'server-request', method: input.method, requestId: input.id, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onServerReply(input: { id: number | string; ok: boolean }): void {
    this.emit({ direction: 'out', kind: 'server-reply', requestId: input.id, ok: input.ok, bytes: 0 });
  }

  onConnection(input: { state: 'starting' | 'ws-url' | 'connected' | 'initialized' | 'closed' | 'error' | 'stopped'; detail?: unknown }): void {
    this.emit({ direction: 'in', kind: 'connection', method: input.state, bytes: byteSize(input.detail), payload: input.detail });
  }

  private emit(record: CodexWireRecord): void {
    this.service.recordWireEvent(record);
  }
}
