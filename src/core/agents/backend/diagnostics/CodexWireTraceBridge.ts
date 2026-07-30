import type { CodexAppServerWireObserver } from '../CodexAppServerClientTypes';
import type { CodexSessionTraceService } from './CodexSessionTraceService';
import type { CodexWireRecord } from './types';

function byteSize(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
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
  private readonly clientRequestThreads = new Map<number, string>();
  private readonly serverRequestThreads = new Map<number | string, string>();

  constructor(private readonly service: CodexSessionTraceService) {}

  onRequest(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void {
    const threadId = threadIdOf(input.params);
    if (threadId) this.clientRequestThreads.set(input.id, threadId);
    this.emit({ direction: 'out', kind: 'request', method: input.method, requestId: input.id, threadId, bytes: byteSize(input.params), payload: input.params });
  }

  onResponse(input: { id: number; ok: boolean; durationMs: number; error?: string }): void {
    const threadId = this.clientRequestThreads.get(input.id);
    this.clientRequestThreads.delete(input.id);
    this.emit({ direction: 'in', kind: 'response', requestId: input.id, threadId, ok: input.ok, durationMs: input.durationMs, bytes: byteSize(input.error), payload: input.error ? { error: input.error } : undefined });
  }

  onNotification(input: { method: string; params: unknown }): void {
    this.emit({ direction: 'in', kind: 'notification', method: input.method, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onServerRequest(input: { id: number | string; method: string; params: unknown }): void {
    const threadId = threadIdOf(input.params);
    if (threadId) this.serverRequestThreads.set(input.id, threadId);
    this.emit({ direction: 'in', kind: 'server-request', method: input.method, requestId: input.id, threadId, bytes: byteSize(input.params), payload: input.params });
  }

  onServerReply(input: { id: number | string; ok: boolean }): void {
    const threadId = this.serverRequestThreads.get(input.id);
    this.serverRequestThreads.delete(input.id);
    this.emit({ direction: 'out', kind: 'server-reply', requestId: input.id, threadId, ok: input.ok, bytes: 0 });
  }

  onConnection(input: { state: 'starting' | 'ws-url' | 'connected' | 'initialized' | 'closed' | 'error' | 'stopped'; detail?: unknown }): void {
    if (input.state === 'closed' || input.state === 'error' || input.state === 'stopped') {
      this.clientRequestThreads.clear();
      this.serverRequestThreads.clear();
    }
    this.emit({ direction: 'in', kind: 'connection', method: input.state, bytes: byteSize(input.detail), payload: input.detail });
  }

  /**
   * Forwards spawned app-server stdout/stderr to the trace service, which
   * redacts known secrets (vault paths, credentials) before recording. Keeps
   * raw service output out of the console log.
   */
  onServiceOutput(input: { stream: 'stdout' | 'stderr'; text: string }): boolean {
    if (!this.service.shouldCaptureServiceOutput()) return false;
    this.service.recordServiceOutput(input.stream, input.text);
    return true;
  }

  private emit(record: CodexWireRecord): void {
    this.service.recordWireEvent(record);
  }
}
