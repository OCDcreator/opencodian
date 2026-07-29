/* eslint-disable max-lines-per-function -- Store hardening scenarios share lifecycle cleanup. */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  type OpenCodeTraceEventV1,
  OpenCodeTraceRedactor,
  OpenCodeTraceReportBuilder,
  OpenCodeTraceStore,
} from '../../../../src/core/opencode/diagnostics';

function event(overrides: Partial<OpenCodeTraceEventV1> = {}): OpenCodeTraceEventV1 {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-hardening',
    runtimeSegmentId: 'runtime-hardening',
    sessionId: 'ses_hardening',
    channel: 'stream-sync',
    source: 'plugin',
    severity: 'info',
    name: 'test.event',
    ...overrides,
  };
}

describe('OpenCodeTraceStore hardening', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-trace-store-'));
  });

  afterEach(async () => {
    await fs.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 10,
    });
  });

  it('enforces the 10 MiB deep-run cap across separate flush batches', async () => {
    const store = new OpenCodeTraceStore(directory);
    const payload = 'deep payload '.repeat(90_000);
    for (let index = 0; index < 12; index += 1) {
      store.append(event({
        monotonicSequence: index + 1,
        runId: 'run-capped',
        payload,
        payloadRef: { kind: 'deep', runId: 'run-capped' },
      }), true);
      await store.flush();
    }

    const deepFile = path.join(directory, 'v1', 'deep', 'run-capped.jsonl');
    expect((await fs.stat(deepFile)).size).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(await store.readTrace('trace-hardening')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'trace.deep_truncated' }),
    ]));
    await store.dispose();
  });

  it('counts deep JSON bytes against the 4 MiB queue bound', async () => {
    const store = new OpenCodeTraceStore(directory);
    const payload = 'deep queue '.repeat(300_000);
    store.append(event({
      runId: 'run-queue',
      payload,
      payloadRef: { kind: 'deep', runId: 'run-queue' },
    }), true);
    store.append(event({
      monotonicSequence: 2,
      runId: 'run-queue',
      payload,
      payloadRef: { kind: 'deep', runId: 'run-queue' },
    }), true);

    expect(store.getStatus().droppedEvents).toBeGreaterThan(0);
    await store.dispose();
  });

  it('rebuilds a missing or corrupt index from structural JSONL', async () => {
    const first = new OpenCodeTraceStore(directory);
    first.bindSession('ses_hardening', 'trace-hardening');
    first.append(event({ name: 'run.started', runId: 'run-rebuild' }));
    first.append(event({ monotonicSequence: 2, severity: 'critical', name: 'anomaly.rebuild' }));
    await first.dispose();
    await fs.writeFile(path.join(directory, 'v1', 'index.json'), '{broken', 'utf8');

    const second = new OpenCodeTraceStore(directory);
    await second.readTrace('trace-hardening');

    expect(second.resolveTraceId('ses_hardening')).toBe('trace-hardening');
    expect(second.listSummaries()).toEqual([
      expect.objectContaining({
        traceId: 'trace-hardening',
        runCount: 1,
        highestSeverity: 'critical',
      }),
    ]);
    await second.dispose();
  });

  it('removes stale index session and summary entries after retention pruning', async () => {
    const first = new OpenCodeTraceStore(directory);
    first.bindSession('ses_hardening', 'trace-hardening');
    first.append(event());
    await first.dispose();
    const structuralFile = path.join(directory, 'v1', 'structural', 'trace-hardening.jsonl');
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fs.utimes(structuralFile, expired, expired);

    const second = new OpenCodeTraceStore(directory);
    await second.readTrace('trace-hardening');

    expect(second.resolveTraceId('ses_hardening')).toBeUndefined();
    expect(second.listSummaries()).toEqual([]);
    await second.dispose();
  });

  it('falls back from an unwritable custom path and degrades safely if both roots fail', async () => {
    const blockedCustom = path.join(directory, 'blocked-custom');
    const fallback = path.join(directory, 'fallback');
    await fs.writeFile(blockedCustom, 'file blocks directory creation');
    const fallbackStore = new OpenCodeTraceStore(blockedCustom, fallback);
    fallbackStore.append(event());
    await fallbackStore.flush();
    expect(fallbackStore.getStatus()).toEqual(expect.objectContaining({
      mode: 'disk',
      rootDirectory: fallback,
    }));
    expect(fallbackStore.getStatus().lastError).toContain('Custom trace directory unavailable');
    await fallbackStore.dispose();

    const blockedFallback = path.join(directory, 'blocked-fallback');
    await fs.writeFile(blockedFallback, 'file blocks fallback creation');
    const memoryStore = new OpenCodeTraceStore(blockedCustom, blockedFallback);
    memoryStore.append(event());
    await memoryStore.flush();
    expect(memoryStore.getStatus().mode).toBe('memory');
    await expect(memoryStore.deleteTrace('trace-hardening')).resolves.toBeUndefined();
    await expect(memoryStore.clear()).resolves.toBeUndefined();
    await memoryStore.dispose();
  });

  it('keeps standalone storage degradation fail-safe isolated and free of raw error details', async () => {
    const blockedRoot = path.join(directory, 'standalone-blocked');
    await fs.writeFile(blockedRoot, 'file blocks directory creation');
    const store = new OpenCodeTraceStore(blockedRoot, blockedRoot);

    store.append(event());
    await store.flush();

    const serialized = JSON.stringify(await store.readTrace('storage-degraded'));
    expect(serialized).not.toContain('file blocks directory creation');
    expect(serialized).not.toContain(blockedRoot);
    expect(store.getStatus().lastError).not.toContain(blockedRoot);
    await store.dispose();
  });

  it('merges readable disk history with later memory-mode events without duplicates', async () => {
    const store = new OpenCodeTraceStore(directory);
    const oldStructural = event({ monotonicSequence: 1, name: 'disk.structural' });
    const oldRuntime = event({
      monotonicSequence: 2,
      traceId: 'runtime-hardening',
      runtimeSegmentId: 'runtime-hardening',
      sessionId: undefined,
      name: 'disk.runtime',
    });
    store.append(oldStructural);
    store.append(oldRuntime);
    await store.flush();

    const appendSpy = jest.spyOn(fs, 'appendFile')
      .mockRejectedValueOnce(new Error('simulated write failure'));
    store.append(event({ monotonicSequence: 3, name: 'memory.structural' }));
    store.append(event({
      monotonicSequence: 4,
      traceId: 'runtime-hardening',
      runtimeSegmentId: 'runtime-hardening',
      sessionId: undefined,
      name: 'memory.runtime',
    }));
    await store.flush();
    appendSpy.mockRestore();

    const structural = await store.readTrace('trace-hardening');
    const runtime = await store.readRuntimeSegment('runtime-hardening');
    const report = await new OpenCodeTraceReportBuilder(
      store,
      () => 'Build: store-hardening',
      new OpenCodeTraceRedactor(),
    )
      .buildSmartReport('trace-hardening');
    expect(structural.filter((item) => item.name === 'disk.structural')).toHaveLength(1);
    expect(structural.filter((item) => item.name === 'memory.structural')).toHaveLength(1);
    expect(runtime.filter((item) => item.name === 'disk.runtime')).toHaveLength(1);
    expect(runtime.filter((item) => item.name === 'memory.runtime')).toHaveLength(1);
    expect(report).toContain('disk.structural');
    expect(report).toContain('memory.structural');
    expect(store.getStatus().mode).toBe('memory');

    store.append(event({
      monotonicSequence: 5,
      runId: 'memory-deep',
      payload: { text: 'must-not-recover-deep-body' },
      payloadRef: { kind: 'deep', runId: 'memory-deep' },
    }), true);
    await store.flush();
    expect(await store.readDeepRun('memory-deep')).toEqual([]);
    await store.dispose();
  });

  it('sanitizes JSONL again during export and refreshes occupancy after deletion', async () => {
    const store = new OpenCodeTraceStore(directory);
    store.append(event({ payload: 'Authorization: Bearer export-canary-secret' }));
    await store.flush();
    expect(store.getStatus().approximateBytes).toBeGreaterThan(0);

    const bundle = await store.exportTraceBundle('trace-hardening', path.join(directory, 'exports'));
    const exported = await fs.readFile(path.join(bundle, 'structural.jsonl'), 'utf8');
    expect(exported).not.toContain('export-canary-secret');

    await store.deleteTrace('trace-hardening');
    expect(store.getStatus().approximateBytes).toBe(0);
    await store.dispose();
  });

  it('restricts diagnostic directories and files to the current user on POSIX', async () => {
    if (process.platform === 'win32') return;
    const store = new OpenCodeTraceStore(directory);
    store.append(event());
    await store.flush();

    // eslint-disable-next-line jest/no-conditional-expect
    expect((await fs.stat(path.join(directory, 'v1'))).mode & 0o777).toBe(0o700);
    // eslint-disable-next-line jest/no-conditional-expect
    expect(
      (await fs.stat(path.join(directory, 'v1', 'structural', 'trace-hardening.jsonl'))).mode & 0o777,
    ).toBe(0o600);
    await store.dispose();
  });

  it('records trace.coalesced when repeated text deltas overload the queue', async () => {
    const store = new OpenCodeTraceStore(directory);
    for (let index = 0; index < 4097; index += 1) {
      store.append(event({
        monotonicSequence: index + 1,
        name: 'stream.text.delta',
        runId: 'run-coalesced',
      }));
    }
    await store.flush();
    store.append(event({ monotonicSequence: 4098, name: 'after.coalescing' }));
    await store.flush();

    expect(await store.readTrace('trace-hardening')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'trace.coalesced' }),
    ]));
    await store.dispose();
  });

  it('persists pressure notices when overload is followed directly by dispose', async () => {
    const store = new OpenCodeTraceStore(directory);
    for (let index = 0; index < 4097; index += 1) {
      store.append(event({
        monotonicSequence: index + 1,
        name: 'stream.text.delta',
        runId: 'run-dispose-pressure',
      }));
    }
    store.append(event({ monotonicSequence: 4098, name: 'non-coalescible-overflow' }));
    await store.dispose();

    const recovered = new OpenCodeTraceStore(directory);
    const events = await recovered.readTrace('trace-hardening');
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'trace.coalesced' }),
      expect.objectContaining({ name: 'trace.dropped' }),
    ]));
    expect(recovered.getStatus().queuedEvents).toBeLessThanOrEqual(4096);
    await recovered.dispose();
  });
});
