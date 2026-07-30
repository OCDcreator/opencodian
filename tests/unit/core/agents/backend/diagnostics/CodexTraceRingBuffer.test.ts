import { CodexTraceRingBuffer } from '../../../../../../src/core/agents/backend/diagnostics/CodexTraceRingBuffer';
import type { CodexWireRecord } from '../../../../../../src/core/agents/backend/diagnostics/types';

function record(bytes: number): CodexWireRecord {
  return { direction: 'in', kind: 'notification', method: 'm', bytes };
}

describe('CodexTraceRingBuffer', () => {
  it('drains per-thread entries together with the shared lane', () => {
    const buffer = new CodexTraceRingBuffer();
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record(undefined, { recordedAt: 2, record: record(10) });
    buffer.record('t2', { recordedAt: 3, record: record(10) });
    const drained = buffer.drain('t1');
    expect(drained.map((entry) => entry.recordedAt)).toEqual([1, 2]);
    expect(buffer.sizeBytes()).toBe(10);
  });

  it('evicts oldest entries of a thread beyond the per-thread byte cap', () => {
    const buffer = new CodexTraceRingBuffer({ perThreadBytes: 25, totalBytes: 1000 });
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record('t1', { recordedAt: 2, record: record(10) });
    buffer.record('t1', { recordedAt: 3, record: record(10) });
    expect(buffer.drain('t1').map((entry) => entry.recordedAt)).toEqual([2, 3]);
  });

  it('evicts globally oldest entries beyond the total byte cap', () => {
    const buffer = new CodexTraceRingBuffer({ perThreadBytes: 1000, totalBytes: 25 });
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record('t2', { recordedAt: 2, record: record(10) });
    buffer.record('t3', { recordedAt: 3, record: record(10) });
    expect(buffer.sizeBytes()).toBe(20);
    expect(buffer.drain('t1')).toHaveLength(0);
  });
});
