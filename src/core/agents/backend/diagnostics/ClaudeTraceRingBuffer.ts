import type { ClaudeSdkTraceRecord } from './types';

export interface ClaudeTraceRingBufferEntry {
  recordedAt: number;
  record: ClaudeSdkTraceRecord;
}

const DEFAULT_PER_SESSION_BYTES = 5 * 1024 * 1024;
const DEFAULT_TOTAL_BYTES = 20 * 1024 * 1024;
const SHARED_LANE = '';

/**
 * Bounded, per-session buffer of already-redacted Claude SDK messages. It is
 * only drained into deep trace files when an error, stall, or export needs
 * the immediately preceding SDK evidence.
 */
export class ClaudeTraceRingBuffer {
  private readonly perSessionBytes: number;
  private readonly totalBytes: number;
  private readonly lanes = new Map<string, ClaudeTraceRingBufferEntry[]>();
  private readonly laneBytes = new Map<string, number>();
  private total = 0;

  constructor(options?: { perSessionBytes?: number; totalBytes?: number }) {
    this.perSessionBytes = options?.perSessionBytes ?? DEFAULT_PER_SESSION_BYTES;
    this.totalBytes = options?.totalBytes ?? DEFAULT_TOTAL_BYTES;
  }

  record(sessionId: string | undefined, entry: ClaudeTraceRingBufferEntry): void {
    const lane = sessionId ?? SHARED_LANE;
    const entries = this.lanes.get(lane) ?? [];
    entries.push(entry);
    this.lanes.set(lane, entries);
    this.laneBytes.set(lane, (this.laneBytes.get(lane) ?? 0) + entry.record.bytes);
    this.total += entry.record.bytes;
    this.evictLane(lane);
    this.evictGlobal();
  }

  drain(sessionId?: string): ClaudeTraceRingBufferEntry[] {
    const lanes = sessionId === undefined ? [...this.lanes.keys()] : [sessionId, SHARED_LANE];
    const drained: ClaudeTraceRingBufferEntry[] = [];
    for (const lane of lanes) {
      const entries = this.lanes.get(lane) ?? [];
      drained.push(...entries);
      this.lanes.delete(lane);
      this.laneBytes.delete(lane);
    }
    this.total = [...this.laneBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
    return drained.sort((left, right) => left.recordedAt - right.recordedAt);
  }

  sizeBytes(): number {
    return this.total;
  }

  private evictLane(lane: string): void {
    const entries = this.lanes.get(lane);
    if (!entries) return;
    let bytes = this.laneBytes.get(lane) ?? 0;
    while (bytes > this.perSessionBytes && entries.length > 0) {
      const removed = entries.shift() as ClaudeTraceRingBufferEntry;
      bytes -= removed.record.bytes;
      this.total -= removed.record.bytes;
    }
    this.laneBytes.set(lane, bytes);
  }

  private evictGlobal(): void {
    while (this.total > this.totalBytes) {
      let oldestLane: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [lane, entries] of this.lanes) {
        const first = entries[0];
        if (first && first.recordedAt < oldestAt) {
          oldestAt = first.recordedAt;
          oldestLane = lane;
        }
      }
      if (oldestLane === undefined) return;
      const removed = (this.lanes.get(oldestLane) as ClaudeTraceRingBufferEntry[]).shift() as ClaudeTraceRingBufferEntry;
      this.laneBytes.set(oldestLane, (this.laneBytes.get(oldestLane) ?? 0) - removed.record.bytes);
      this.total -= removed.record.bytes;
    }
  }
}
