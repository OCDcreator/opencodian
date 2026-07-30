import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { TraceEventBase } from '../../../../src/shared/diagnostics';
import { TraceRedactor, TraceReportBuilder, TraceStore } from '../../../../src/shared/diagnostics';

function event(overrides: Partial<TraceEventBase> = {}): TraceEventBase {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-r',
    runtimeSegmentId: 'seg-r',
    sessionId: 'thread-1',
    channel: 'lifecycle',
    source: 'plugin',
    severity: 'info',
    name: 'turn.started',
    ...overrides,
  };
}

describe('TraceReportBuilder (shared)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-shared-report-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('renders the injected title and metadata lines', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event());
    await store.flush();
    const builder = new TraceReportBuilder(store, () => 'Build: test', new TraceRedactor(), {
      title: 'OpenCodian Codex Session Trace',
      extractMetadata: () => ['Threads: 1', 'Turns: 3'],
    });
    const report = await builder.buildSmartReport('trace-r');
    expect(report).toContain('# OpenCodian Codex Session Trace');
    expect(report).toContain('Threads: 1');
    expect(report).toContain('## Trace events');
    await store.dispose();
  });

  it('redacts secrets in rendered reports', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event({ payload: { note: 'sk-live-secret-9999' } }));
    await store.flush();
    const builder = new TraceReportBuilder(store, () => 'Build: test', new TraceRedactor({ knownSecrets: ['sk-live-secret-9999'] }), {
      title: 'T',
    });
    const report = await builder.buildSmartReport('trace-r');
    expect(report).not.toContain('sk-live-secret-9999');
    await store.dispose();
  });
});
