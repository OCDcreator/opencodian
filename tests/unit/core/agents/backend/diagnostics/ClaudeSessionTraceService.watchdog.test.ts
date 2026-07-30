import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/ClaudeSessionTraceService';
import { CLAUDE_TRACE_CHANNEL_IDS, type ClaudeSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): ClaudeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CLAUDE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as ClaudeSessionTraceSettings['consoleChannels'],
    storageDirectory,
  };
}

describe('ClaudeSessionTraceService watchdog', () => {
  let dir: string;
  let service: ClaudeSessionTraceService;

  beforeEach(() => {
    jest.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-watchdog-'));
    service = new ClaudeSessionTraceService({ settings: () => traceSettings(dir) });
  });

  afterEach(async () => {
    await service.dispose();
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('replays a pre-SDK watchdog warning only after binding to the SDK trace', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-watchdog-warning',
      turnId: 'turn-provisional-warning',
      provisional: true,
    });
    const provisionalTraceId = turn.traceId;
    jest.advanceTimersByTime(60_000);
    const bound = service.bindSession({
      sessionId: 'sdk-watchdog-warning',
      provisionalId: 'provisional-watchdog-warning',
      resumed: false,
      via: 'sdk',
    });
    await service.store.flush();

    const events = await service.store.readTrace(bound.traceId);
    expect(bound.traceId).toBe('sdk-watchdog-warning');
    expect(events.some((event) => event.name === 'session.bound')).toBe(true);
    expect(events.some((event) => event.name === 'turn.started')).toBe(true);
    expect(events.some((event) => event.name === 'turn.stalled' && event.severity === 'warning')).toBe(true);
    expect((await service.store.readTrace(provisionalTraceId)).length).toBe(0);

    jest.advanceTimersByTime(120_000);
    await service.store.flush();
    const terminalEvents = await service.store.readTrace(bound.traceId);
    expect(terminalEvents.some((event) => event.name === 'turn.stalled' && event.severity === 'critical')).toBe(true);
    expect((terminalEvents.find((event) => event.name === 'turn.finished')?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
  });

  it('marks a pre-SDK provisional turn incomplete at 180 seconds', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-watchdog-critical',
      turnId: 'turn-provisional-critical',
      provisional: true,
    });
    jest.advanceTimersByTime(180_000);
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled' && event.severity === 'critical')).toBe(true);
    const terminal = events.find((event) => event.name === 'turn.finished');
    expect((terminal?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
  });

  it('materializes an error event before the SDK session is known', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-send-error',
      turnId: 'turn-provisional-error',
      provisional: true,
    });
    service.recordTurnEvent(turn, 'turn.send_failed', 'error', { reason: 'send threw' });
    service.finishTurn(turn, 'error');
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.send_failed' && event.severity === 'error')).toBe(true);
    const terminal = events.find((event) => event.name === 'turn.finished');
    expect((terminal?.payload as { state?: string } | undefined)?.state).toBe('error');
  });

  it('resets watchdog silence after each SDK message', async () => {
    const turn = service.beginTurn({ sessionId: 'sdk-watchdog-reset', turnId: 'turn-reset' });
    jest.advanceTimersByTime(50_000);
    service.recordSdkMessage(turn, { type: 'assistant', uuid: 'message-reset' });
    jest.advanceTimersByTime(50_000);
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled')).toBe(false);
    service.finishTurn(turn, 'completed');
  });
});
