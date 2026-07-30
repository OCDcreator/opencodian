import type { CodexWireRecord } from './types';

export interface CodexTraceRingBufferEntry {
  recordedAt: number;
  record: CodexWireRecord;
}

const DEFAULT_PER_THREAD_BYTES = 5 * 1024 * 1024;
const DEFAULT_TOTAL_BYTES = 20 * 1024 * 1024;
const SHARED_LANE = '';

export class CodexTraceRingBuffer {
  private readonly perThreadBytes: number;
  private readonly totalBytes: number;
  private readonly lanes = new Map<string, CodexTraceRingBufferEntry[]>();
  private readonly laneBytes = new Map<string, number>();
  private total = 0;

  constructor(options?: { perThreadBytes?: number; totalBytes?: number }) {
    this.perThreadBytes = options?.perThreadBytes ?? DEFAULT_PER_THREAD_BYTES;
    this.totalBytes = options?.totalBytes ?? DEFAULT_TOTAL_BYTES;
  }

  record(threadId: string | undefined, entry: CodexTraceRingBufferEntry): void {
    const lane = threadId ?? SHARED_LANE;
    const entries = this.lanes.get(lane) ?? [];
    entries.push(entry);
    this.lanes.set(lane, entries);
    this.laneBytes.set(lane, (this.laneBytes.get(lane) ?? 0) + entry.record.bytes);
    this.total += entry.record.bytes;
    this.evictLane(lane);
    this.evictGlobal();
  }

  drain(threadId?: string): CodexTraceRingBufferEntry[] {
    const lanes = threadId === undefined ? [...this.lanes.keys()] : [threadId, SHARED_LANE];
    const drained: CodexTraceRingBufferEntry[] = [];
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
    while (bytes > this.perThreadBytes && entries.length > 0) {
      const removed = entries.shift() as CodexTraceRingBufferEntry;
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
      const removed = (this.lanes.get(oldestLane) as CodexTraceRingBufferEntry[]).shift() as CodexTraceRingBufferEntry;
      this.laneBytes.set(oldestLane, (this.laneBytes.get(oldestLane) ?? 0) - removed.record.bytes);
      this.total -= removed.record.bytes;
    }
  }
}
