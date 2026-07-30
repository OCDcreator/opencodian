import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import type { CodexSessionTraceSettings, CodexTraceEventV1 } from '../../../../../../src/core/agents/backend/diagnostics/types';
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

// eslint-disable-next-line max-lines-per-function -- one service fixture keeps lifecycle, capture, and redaction regressions readable together.
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

  it('measures turn notification payloads in UTF-8 bytes', async () => {
    const turn = service.beginTurn({ threadId: 'thread-turn-bytes', turnId: 'turn-turn-bytes' });
    const payload = { delta: '你好🙂' };
    service.recordTurnNotification(turn, 'item/agentMessage/delta', payload);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    const notification = events.find((event) => event.name === 'turn.notification');
    expect(notification?.metrics?.bytes).toBe(Buffer.byteLength(JSON.stringify(payload), 'utf8'));
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

  it('does not create storage, retain raw ring data, or arm a watchdog while disabled', async () => {
    await service.dispose();
    const disabledDirectory = path.join(dir, 'disabled-trace');
    let enabled = false;
    service = new CodexSessionTraceService({
      settings: () => ({ ...traceSettings(disabledDirectory), enabled }),
    });

    service.recordWireEvent({
      direction: 'out',
      kind: 'request',
      method: 'turn/start',
      threadId: 'thread-disabled',
      bytes: 32,
      payload: { prompt: 'must-not-survive-disabled' },
    });
    service.beginTurn({ threadId: 'thread-disabled', turnId: 'turn-disabled' });
    await service.store.flush();
    expect(fs.existsSync(disabledDirectory)).toBe(false);

    enabled = true;
    service.bindThread({ threadId: 'thread-disabled', resumed: false, via: 'app-server', tabId: 'tab-disabled' });
    service.armDeepCapture('tab-disabled', 'thread-disabled');
    const token = service.claimDeepCapture('tab-disabled', 'thread-disabled');
    const turn = service.beginTurn({ threadId: 'thread-disabled', turnId: 'turn-enabled', tabId: 'tab-disabled', diagnosticRunToken: token });
    await service.store.flush();
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).not.toContain('must-not-survive-disabled');
  });

  // ---- I1: finishTurn must be idempotent per turn (no double turn.finished) ----
  it('emits turn.finished only once when finishTurn is called twice for the same turn', async () => {
    const bound = service.bindThread({ threadId: 'thread-i1', resumed: false, via: 'app-server' });
    const turn = service.beginTurn({ threadId: 'thread-i1', turnId: 'turn-i1' });
    // Simulate the auto-finish on turn/completed followed by the adapter's
    // explicit finishTurn — both must run without error, but only one
    // turn.finished event should be recorded.
    service.finishTurn(turn, 'completed');
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const events = await service.store.readTrace(bound.traceId);
    const finished = events.filter((event) => event.name === 'turn.finished');
    expect(finished).toHaveLength(1);
  });

  it('does not let a delayed finish of an earlier turn alter the next turn', async () => {
    const bound = service.bindThread({ threadId: 'thread-interleaved', resumed: false, via: 'app-server' });
    const first = service.beginTurn({ threadId: 'thread-interleaved', turnId: 'turn-first' });
    const second = service.beginTurn({ threadId: 'thread-interleaved', turnId: 'turn-second' });
    service.finishTurn(first, 'completed');
    service.finishTurn(second, 'completed');
    await service.store.flush();
    const finished = (await service.store.readTrace(bound.traceId))
      .filter((event) => event.name === 'turn.finished');
    expect(finished).toHaveLength(2);
    expect(finished.map((event) => event.turnId)).toEqual(expect.arrayContaining(['turn-first', 'turn-second']));
  });

  it('cleans active watchdog and capture state when diagnostics are disabled before finish', async () => {
    let enabled = true;
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), enabled }) });
    service.bindThread({ threadId: 'thread-toggle-off', resumed: false, via: 'app-server', tabId: 'tab-toggle-off' });
    service.armDeepCapture('tab-toggle-off', 'thread-toggle-off');
    const token = service.claimDeepCapture('tab-toggle-off', 'thread-toggle-off');
    const turn = service.beginTurn({ threadId: 'thread-toggle-off', turnId: 'turn-toggle-off', tabId: 'tab-toggle-off', diagnosticRunToken: token });
    enabled = false;
    service.finishTurn(turn, 'cancelled');
    expect(service.getCaptureState('tab-toggle-off')).toBe('off');
  });

  it('clears armed and claimed captures during disabled operations so they cannot revive', async () => {
    let enabled = true;
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), enabled }) });

    service.armDeepCapture('tab-disabled-armed', 'thread-disabled-armed');
    enabled = false;
    expect(service.cancelDeepCapture('tab-disabled-armed')).toBe(true);
    expect(service.getCaptureState('tab-disabled-armed')).toBe('off');
    expect(service.claimDeepCapture('tab-disabled-armed', 'thread-disabled-armed')).toBeUndefined();
    enabled = true;
    expect(service.getCaptureState('tab-disabled-armed')).toBe('off');

    service.armDeepCapture('tab-disabled-claimed', 'thread-disabled-claimed');
    expect(service.claimDeepCapture('tab-disabled-claimed', 'thread-disabled-claimed')).toBeDefined();
    enabled = false;
    expect(service.getCaptureState('tab-disabled-claimed')).toBe('off');
    expect(service.claimDeepCapture('tab-disabled-claimed', 'thread-disabled-claimed')).toBeUndefined();
    enabled = true;
    expect(service.getCaptureState('tab-disabled-claimed')).toBe('off');
  });

  // ---- I2: runCount/deepCaptureCount should count turn.started for Codex ----
  it('counts turn.started as a run in the store summary (runStartEventName injected)', async () => {
    service.bindThread({ threadId: 'thread-i2', resumed: false, via: 'app-server', tabId: 'tab-i2' });
    service.armDeepCapture('tab-i2', 'thread-i2');
    const token = service.claimDeepCapture('tab-i2', 'thread-i2');
    const turn = service.beginTurn({ threadId: 'thread-i2', turnId: 'turn-i2a', tabId: 'tab-i2', diagnosticRunToken: token });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const traceId = service.store.resolveTraceId('thread-i2') as string;
    const summary = service.store.listSummaries(100).find((item) => item.traceId === traceId);
    expect(summary?.runCount).toBe(1);
    expect(summary?.deepCaptureCount).toBe(1);
  });

  // ---- I4: claimed token is cleared on finishTurn and reaped on expiry ----
  it('clears a claimed deep-capture token when the owning turn finishes', async () => {
    service.bindThread({ threadId: 'thread-i4a', resumed: false, via: 'app-server', tabId: 'tab-i4' });
    service.armDeepCapture('tab-i4', 'thread-i4a');
    const token = service.claimDeepCapture('tab-i4', 'thread-i4a');
    expect(token).toBeDefined();
    expect(service.getCaptureState('tab-i4')).toBe('capturing');
    const turn = service.beginTurn({ threadId: 'thread-i4a', turnId: 'turn-i4', tabId: 'tab-i4', diagnosticRunToken: token });
    service.finishTurn(turn, 'completed');
    expect(service.getCaptureState('tab-i4')).toBe('off');
  });

  it('reaps an expired claimed token from getCaptureState', () => {
    jest.useFakeTimers();
    try {
      service.bindThread({ threadId: 'thread-i4b', resumed: false, via: 'app-server', tabId: 'tab-i4b' });
      service.armDeepCapture('tab-i4b', 'thread-i4b');
      const token = service.claimDeepCapture('tab-i4b', 'thread-i4b');
      expect(token).toBeDefined();
      expect(service.getCaptureState('tab-i4b')).toBe('capturing');
      jest.setSystemTime((token?.expiresAt ?? Date.now()) + 1);
      expect(service.getCaptureState('tab-i4b')).toBe('off');
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops writing deep events when a claimed token expires during its turn', async () => {
    jest.useFakeTimers();
    try {
      service.bindThread({ threadId: 'thread-i4c', resumed: false, via: 'app-server', tabId: 'tab-i4c' });
      service.armDeepCapture('tab-i4c', 'thread-i4c');
      const token = service.claimDeepCapture('tab-i4c', 'thread-i4c');
      const turn = service.beginTurn({ threadId: 'thread-i4c', turnId: 'turn-i4c', tabId: 'tab-i4c', diagnosticRunToken: token });
      jest.setSystemTime((token?.expiresAt ?? Date.now()) + 1);
      service.recordWireEvent({
        direction: 'in',
        kind: 'notification',
        method: 'item/agentMessage/delta',
        threadId: 'thread-i4c',
        bytes: 20,
        payload: { delta: 'after-deep-expiry' },
      });
      await service.store.flush();
      const structural = await service.store.readTrace(turn.traceId);
      const wire = structural.find((event) => event.name === 'wire.notification');
      const deep = await service.store.readDeepRun(turn.runId as string);
      expect(wire?.payloadRef?.kind).toBe('inline');
      expect(deep.some((event) => event.name === 'wire.notification')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not deep-capture direct turn, stream, or tool events after the claim expires', async () => {
    jest.useFakeTimers();
    try {
      service.bindThread({ threadId: 'thread-i4d', resumed: false, via: 'app-server', tabId: 'tab-i4d' });
      service.armDeepCapture('tab-i4d', 'thread-i4d');
      const token = service.claimDeepCapture('tab-i4d', 'thread-i4d');
      const turn = service.beginTurn({ threadId: 'thread-i4d', turnId: 'turn-i4d', tabId: 'tab-i4d', diagnosticRunToken: token });
      jest.setSystemTime((token?.expiresAt ?? Date.now()) + 1);
      service.recordTurnNotification(turn, 'item/agentMessage/delta', { delta: 'expired-turn' });
      service.recordStreamSync(turn, 'stream.expired', 'info', { delta: 'expired-stream' });
      service.recordToolInteraction(turn, 'tool.expired', { delta: 'expired-tool' });
      await service.store.flush();
      const deep = await service.store.readDeepRun(turn.runId as string);
      expect(deep.some((event) => ['turn.notification', 'stream.expired', 'tool.expired'].includes(event.name))).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  // ---- I5: ring buffer is flushed into the deep run at beginTurn ----
  it('flushes the turn/start request/response into the deep run when a claimed token begins a turn', async () => {
    service.bindThread({ threadId: 'thread-i5', resumed: false, via: 'app-server', tabId: 'tab-i5' });
    // The turn/start RPC would have landed in the ring buffer before beginTurn.
    service.recordWireEvent({ direction: 'out', kind: 'request', method: 'turn/start', requestId: 1, threadId: 'thread-i5', bytes: 30, payload: { prompt: 'hi-secret' } });
    service.armDeepCapture('tab-i5', 'thread-i5');
    const token = service.claimDeepCapture('tab-i5', 'thread-i5');
    const turn = service.beginTurn({ threadId: 'thread-i5', turnId: 'turn-i5', tabId: 'tab-i5', diagnosticRunToken: token });
    await service.store.flush();
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).toContain('hi-secret');
    expect(JSON.stringify(deep)).toContain('wire.retroactive');
  });

  it('redacts a secret added after construction across deep events, reports, and exports', async () => {
    let currentSecret = 'sk-old-secret';
    await service.dispose();
    service = new CodexSessionTraceService({
      settings: () => traceSettings(dir),
      knownSecrets: () => [currentSecret],
    });
    currentSecret = 'sk-current-secret';
    service.bindThread({ threadId: 'thread-secret', resumed: false, via: 'app-server', tabId: 'tab-secret' });
    service.armDeepCapture('tab-secret', 'thread-secret');
    const token = service.claimDeepCapture('tab-secret', 'thread-secret');
    const turn = service.beginTurn({ threadId: 'thread-secret', tabId: 'tab-secret', diagnosticRunToken: token });
    service.recordWireEvent({
      direction: 'in',
      kind: 'notification',
      method: 'item/agentMessage/delta',
      threadId: 'thread-secret',
      bytes: 20,
      payload: { delta: currentSecret, [currentSecret]: 'secret-key-canary' },
    });
    await service.store.flush();
    expect(JSON.stringify(await service.store.readDeepRun(turn.runId as string))).not.toContain(currentSecret);
    expect(await service.reportBuilder.buildSmartReport(turn.traceId)).not.toContain(currentSecret);

    const historicalSecret = 'sk-historical-secret';
    currentSecret = historicalSecret;
    service.store.append({
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      monotonicSequence: 99_999,
      traceId: turn.traceId,
      runtimeSegmentId: turn.runtimeSegmentId,
      sessionId: turn.threadId,
      channel: 'transport',
      source: 'app-server',
      severity: 'info',
      name: 'historical.raw',
      payload: { historicalSecret, [historicalSecret]: 'historical-key-canary' },
      payloadRef: { kind: 'inline' },
    } satisfies CodexTraceEventV1);
    await service.store.flush();
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-export-'));
    const bundle = await service.store.exportTraceBundle(turn.traceId, exportRoot);
    expect(fs.readFileSync(path.join(bundle, 'structural.jsonl'), 'utf8')).not.toContain(historicalSecret);
    fs.rmSync(exportRoot, { recursive: true, force: true });
  });

  it('uses hardened redaction for persisted Codex error names, keys, and stringified values', async () => {
    const secret = 'codex-hardened-secret-canary';
    const vaultPath = '/Volumes/SDD2T/obsidian-vault-write/testvault';
    await service.dispose();
    service = new CodexSessionTraceService({
      settings: () => traceSettings(dir),
      vaultPath,
      knownSecrets: () => [secret],
    });
    const context = service.bindThread({ threadId: 'thread-hardened', resumed: false, via: 'app-server' });
    const error = new Error('ordinary message');
    error.name = `${vaultPath}/${secret}`;
    service.recordTurnNotification(context, 'item/agentMessage/delta', {
      [secret]: 'secret-key-canary',
      error,
      symbol: Symbol(`${vaultPath}/${secret}`),
      environment: { [secret]: 'environment-key-canary' },
    });
    await service.store.flush();

    const persisted = JSON.stringify(await service.store.readTrace(context.traceId));
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain(vaultPath);
  });

  it('uses service-output limits and metrics exactly once', async () => {
    service.recordServiceOutput('stderr', 'service output '.repeat(2_000));
    await service.store.flush();
    const events = await service.store.readRuntimeSegment(service.runtimeSegmentId);
    const output = events.find((event) => event.name === 'service.output');
    expect((output?.payload as { truncated?: boolean } | undefined)?.truncated).toBe(true);
    expect(output?.metrics?.truncatedValues).toBe(1);
  });

  it('redacts stderr service output before warning console mirroring and persistence', async () => {
    const secret = 'codex-service-output-secret-canary';
    const vaultPath = '/Volumes/SDD2T/obsidian-vault-write/testvault';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.dispose();
    service = new CodexSessionTraceService({
      settings: () => traceSettings(dir),
      vaultPath,
      knownSecrets: () => [secret],
    });
    try {
      service.recordServiceOutput('stderr', `Error: ${secret} at ${vaultPath}/secret-note.md`);
      await service.store.flush();
      const consoleOutput = JSON.stringify(warn.mock.calls);
      const runtime = JSON.stringify(await service.store.readRuntimeSegment(service.runtimeSegmentId));
      for (const output of [consoleOutput, runtime]) {
        expect(output).not.toContain(secret);
        expect(output).not.toContain(vaultPath);
      }
    } finally {
      warn.mockRestore();
    }
  });
});
