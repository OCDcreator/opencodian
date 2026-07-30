import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import { CODEX_TRACE_CHANNEL_IDS, type CodexSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
  };
}

describe('CodexSessionTraceService watchdog', () => {
  let dir: string;
  let service: CodexSessionTraceService;
  beforeEach(() => {
    jest.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-watchdog-'));
    service = new CodexSessionTraceService({ settings: () => traceSettings(dir) });
  });
  afterEach(async () => {
    await service.dispose();
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns at 60s of silence and flushes the ring buffer retroactively', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w1', turnId: 'turn-w1' });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-w1', bytes: 10, payload: { delta: 'x' } });
    jest.advanceTimersByTime(60_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled' && event.severity === 'warning')).toBe(true);
    expect(events.some((event) => event.name === 'wire.retroactive')).toBe(true);
  });

  it('marks the turn incomplete at 180s of silence', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w2', turnId: 'turn-w2' });
    jest.advanceTimersByTime(180_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    const finish = events.find((event) => event.name === 'turn.finished');
    expect((finish?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
  });

  it('resets the watchdog on each notification', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w3', turnId: 'turn-w3' });
    jest.advanceTimersByTime(50_000);
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-w3', bytes: 5 });
    jest.advanceTimersByTime(50_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled')).toBe(false);
    service.finishTurn(turn, 'completed');
  });

  it('fails active turns when the transport closes', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w4', turnId: 'turn-w4' });
    service.recordWireEvent({ direction: 'in', kind: 'connection', method: 'closed', bytes: 0 });
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'transport.closed' && event.severity === 'error')).toBe(true);
    const finish = events.find((event) => event.name === 'turn.finished');
    expect((finish?.payload as { state?: string } | undefined)?.state).toBe('error');
  });

  it('does not arm a watchdog for a turn started while diagnostics are disabled', async () => {
    await service.dispose();
    let enabled = false;
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), enabled }) });
    service.beginTurn({ threadId: 'thread-disabled-watchdog', turnId: 'turn-disabled-watchdog' });
    enabled = true;
    service.bindThread({ threadId: 'thread-disabled-watchdog', resumed: false, via: 'app-server' });
    jest.advanceTimersByTime(180_000);
    await service.store.flush();
    const traceId = service.store.resolveTraceId('thread-disabled-watchdog') as string;
    const events = await service.store.readTrace(traceId);
    expect(events.some((event) => event.name === 'turn.stalled')).toBe(false);
  });
});
