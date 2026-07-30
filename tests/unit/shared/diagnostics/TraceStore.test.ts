import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TraceEventBase } from '../../../../src/shared/diagnostics';
import { TraceStore } from '../../../../src/shared/diagnostics';

function event(overrides: Partial<TraceEventBase> = {}): TraceEventBase {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-x',
    runtimeSegmentId: 'seg-x',
    channel: 'transport',
    source: 'app-server',
    severity: 'info',
    name: 'test.event',
    ...overrides,
  };
}

describe('TraceStore (shared)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-shared-store-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes structural events per traceId and reads them back', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event({ sessionId: 'thread-1', traceId: 'trace-a' }));
    await store.flush();
    const events = await store.readTrace('trace-a');
    expect(events).toHaveLength(1);
    expect(events[0].sessionId).toBe('thread-1');
    await store.dispose();
  });

  it('resolves bound session ids to trace ids', () => {
    const store = new TraceStore(undefined, dir);
    store.bindSession('thread-9', 'trace-9');
    expect(store.resolveTraceId('thread-9')).toBe('trace-9');
  });

  it('uses the bundlePrefix for exported bundle directories', async () => {
    const store = new TraceStore(undefined, dir, { bundlePrefix: 'codex-trace' });
    store.append(event({ sessionId: 'thread-1', traceId: 'trace-b' }));
    await store.flush();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-export-'));
    const bundlePath = await store.exportTraceBundle('trace-b', target);
    expect(path.basename(bundlePath)).toMatch(/^codex-trace-trace-b-/);
    fs.rmSync(target, { recursive: true, force: true });
    await store.dispose();
  });

  it('does not queue or initialize storage while disabled until explicitly enabled', async () => {
    const disabledDirectory = path.join(dir, 'disabled');
    const store = new TraceStore(undefined, disabledDirectory, { disabled: true });
    store.append(event({ traceId: 'trace-disabled' }));
    await store.flush();
    expect(fs.existsSync(disabledDirectory)).toBe(false);
    expect(await store.readTrace('trace-disabled')).toEqual([]);

    store.enable();
    store.append(event({ traceId: 'trace-enabled' }));
    await store.flush();
    expect(await store.readTrace('trace-enabled')).toHaveLength(1);
    await store.dispose();
  });

  it('clears memory only without creating a directory while disabled', async () => {
    const disabledDirectory = path.join(dir, 'disabled-clear');
    const store = new TraceStore(undefined, disabledDirectory, { disabled: true });
    await store.clear();
    expect(fs.existsSync(disabledDirectory)).toBe(false);
    await store.dispose();
  });
});
