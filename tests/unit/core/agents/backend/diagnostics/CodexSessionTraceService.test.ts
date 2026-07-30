import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import type { CodexSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';
import { CODEX_TRACE_CHANNEL_IDS } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
  };
}

describe('CodexSessionTraceService', () => {
  let dir: string;
  let service: CodexSessionTraceService;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-trace-'));
    service = new CodexSessionTraceService({ settings: () => traceSettings(dir) });
  });
  afterEach(async () => {
    await service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('binds a thread to a stable trace id and resumes it across service instances', async () => {
    const first = service.bindThread({ threadId: 'thread-abc', resumed: false, via: 'app-server' });
    expect(first.traceId).toMatch(/^trace-[0-9a-f]{32}$/);
    await service.store.flush();
    const second = service.bindThread({ threadId: 'thread-abc', resumed: true, via: 'app-server' });
    expect(second.traceId).toBe(first.traceId);
    const names = (await service.store.readTrace(first.traceId)).map((event) => event.name);
    expect(names).toContain('thread.bound');
    expect(names).toContain('thread.resumed');
  });

  it('records a turn lifecycle and finishes with terminal state', async () => {
    const bound = service.bindThread({ threadId: 'thread-t1', resumed: false, via: 'app-server' });
    const turn = service.beginTurn({ threadId: 'thread-t1', turnId: 'turn-1' });
    expect(turn.traceId).toBe(bound.traceId);
    service.recordTurnNotification(turn, 'item/agentMessage/delta', { threadId: 'thread-t1' });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const names = (await service.store.readTrace(bound.traceId)).map((event) => event.name);
    expect(names).toEqual(expect.arrayContaining(['turn.started', 'turn.notification', 'turn.finished']));
  });

  it('writes deep payloads only for claimed deep-capture runs', async () => {
    service.bindThread({ threadId: 'thread-d1', resumed: false, via: 'app-server' });
    service.armDeepCapture('tab-1', 'thread-d1');
    const token = service.claimDeepCapture('tab-1', 'thread-d1');
    const turn = service.beginTurn({ threadId: 'thread-d1', turnId: 'turn-9', diagnosticRunToken: token });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-d1', bytes: 42, payload: { delta: 'secret body' } });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const structural = await service.store.readTrace(turn.traceId);
    const wireEvent = structural.find((event) => event.name === 'wire.notification');
    expect(wireEvent?.payloadRef?.kind).toBe('deep');
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).toContain('secret body');
  });

  it('keeps wire payloads as shape summaries when not deep-capturing', async () => {
    service.bindThread({ threadId: 'thread-s1', resumed: false, via: 'app-server' });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-s1', bytes: 42, payload: { delta: 'should not persist' } });
    await service.store.flush();
    const events = await service.store.readTrace(service.store.resolveTraceId('thread-s1') as string);
    const wire = events.find((event) => event.name === 'wire.notification');
    expect(JSON.stringify(wire?.payload)).not.toContain('should not persist');
  });

  it('respects captureContent=false during deep capture', async () => {
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), captureContent: false }) });
    service.bindThread({ threadId: 'thread-c1', resumed: false, via: 'app-server' });
    service.armDeepCapture('tab-1', 'thread-c1');
    const token = service.claimDeepCapture('tab-1', 'thread-c1');
    const turn = service.beginTurn({ threadId: 'thread-c1', diagnosticRunToken: token });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-c1', bytes: 10, payload: { delta: 'hidden body' } });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).not.toContain('hidden body');
  });

  it('does nothing when disabled', async () => {
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), enabled: false }) });
    const bound = service.bindThread({ threadId: 'thread-off', resumed: false, via: 'app-server' });
    service.finishTurn(service.beginTurn({ threadId: 'thread-off' }), 'completed');
    await service.store.flush();
    const events = await service.store.readTrace(bound.traceId);
    expect(events.filter((event) => event.name !== 'runtime.started')).toHaveLength(0);
  });
});
