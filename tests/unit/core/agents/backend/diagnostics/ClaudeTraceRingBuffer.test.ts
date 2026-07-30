import { ClaudeTraceRingBuffer } from '../../../../../../src/core/agents/backend/diagnostics/ClaudeTraceRingBuffer';
import type { ClaudeSdkTraceRecord } from '../../../../../../src/core/agents/backend/diagnostics/types';

function record(bytes: number): ClaudeSdkTraceRecord {
  return { type: 'assistant', bytes, payload: { bytes } };
}

describe('ClaudeTraceRingBuffer', () => {
  it('drains per-session entries together with the shared lane in timestamp order', () => {
    const buffer = new ClaudeTraceRingBuffer();
    buffer.record('session-1', { recordedAt: 3, record: record(10) });
    buffer.record(undefined, { recordedAt: 1, record: record(10) });
    buffer.record('session-2', { recordedAt: 2, record: record(10) });

    const drained = buffer.drain('session-1');

    expect(drained.map((entry) => entry.recordedAt)).toEqual([1, 3]);
    expect(buffer.sizeBytes()).toBe(10);
  });

  it('evicts oldest entries of a session beyond the per-session byte cap', () => {
    const buffer = new ClaudeTraceRingBuffer({ perSessionBytes: 25, totalBytes: 1000 });
    buffer.record('session-1', { recordedAt: 1, record: record(10) });
    buffer.record('session-1', { recordedAt: 2, record: record(10) });
    buffer.record('session-1', { recordedAt: 3, record: record(10) });

    expect(buffer.drain('session-1').map((entry) => entry.recordedAt)).toEqual([2, 3]);
  });

  it('uses the 5 MiB default per-session cap', () => {
    const buffer = new ClaudeTraceRingBuffer();
    const fiveMiB = 5 * 1024 * 1024;
    buffer.record('session-1', { recordedAt: 1, record: record(fiveMiB) });
    buffer.record('session-1', { recordedAt: 2, record: record(1) });

    expect(buffer.drain('session-1').map((entry) => entry.recordedAt)).toEqual([2]);
  });

  it('evicts globally oldest entries beyond the total byte cap', () => {
    const buffer = new ClaudeTraceRingBuffer({ perSessionBytes: 1000, totalBytes: 25 });
    buffer.record('session-1', { recordedAt: 1, record: record(10) });
    buffer.record('session-2', { recordedAt: 2, record: record(10) });
    buffer.record('session-3', { recordedAt: 3, record: record(10) });

    expect(buffer.sizeBytes()).toBe(20);
    expect(buffer.drain('session-1')).toHaveLength(0);
  });

  it('uses the 20 MiB default global cap across sessions', () => {
    const buffer = new ClaudeTraceRingBuffer();
    const fiveMiB = 5 * 1024 * 1024;
    for (let index = 1; index <= 5; index += 1) {
      buffer.record(`session-${index}`, { recordedAt: index, record: record(fiveMiB) });
    }

    expect(buffer.sizeBytes()).toBe(20 * 1024 * 1024);
    expect(buffer.drain('session-1')).toHaveLength(0);
    expect(buffer.drain('session-2').map((entry) => entry.recordedAt)).toEqual([2]);
  });

  it('drains every lane when no session is selected', () => {
    const buffer = new ClaudeTraceRingBuffer({ perSessionBytes: 1000, totalBytes: 1000 });
    buffer.record('session-1', { recordedAt: 2, record: record(10) });
    buffer.record(undefined, { recordedAt: 1, record: record(10) });
    buffer.record('session-2', { recordedAt: 3, record: record(10) });

    expect(buffer.drain().map((entry) => entry.recordedAt)).toEqual([1, 2, 3]);
    expect(buffer.sizeBytes()).toBe(0);
  });
});
