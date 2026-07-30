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

// eslint-disable-next-line max-lines-per-function -- The shared fixture covers trace lifecycle, delayed SDK binding, watchdogs, and redaction together.
describe('ClaudeSessionTraceService', () => {
  let dir: string;
  let service: ClaudeSessionTraceService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-trace-'));
    service = new ClaudeSessionTraceService({ settings: () => traceSettings(dir) });
  });

  afterEach(async () => {
    await service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('migrates a provisional turn to the SDK session trace id before recording SDK and normalized events', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-turn-1',
      turnId: 'turn-1',
      provisional: true,
      tabId: 'tab-1',
    });
    const bound = service.bindSession({
      sessionId: 'sdk-session-1',
      provisionalId: 'provisional-turn-1',
      resumed: false,
      via: 'sdk',
      tabId: 'tab-1',
    });
    service.recordSdkMessage(turn, { type: 'assistant', uuid: 'message-1', message: { content: 'sdk body' } });
    service.recordNormalizedChunk(turn, 'text', { messageUuid: 'message-1', text: 'normalized body' });
    service.finishTurn(turn, 'completed');
    await service.store.flush();

    expect(turn.traceId).toBe('sdk-session-1');
    expect(bound.traceId).toBe('sdk-session-1');
    const events = await service.store.readTrace('sdk-session-1');
    const names = events.map((event) => event.name);
    const started = names.indexOf('turn.started');
    const sdk = names.indexOf('sdk.message.assistant');
    const chunk = names.indexOf('stream.chunk.text');
    const finished = names.indexOf('turn.finished');
    expect(started).toBeGreaterThanOrEqual(0);
    expect(sdk).toBeGreaterThan(started);
    expect(chunk).toBeGreaterThan(sdk);
    expect(finished).toBeGreaterThan(chunk);
  });

  it('buffers SDK and chunk events that precede the SDK session binding, then replays them on the SDK trace', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-replay',
      turnId: 'turn-replay',
      provisional: true,
    });
    service.recordSdkMessage(turn, { type: 'assistant', uuid: 'message-before-bind' });
    service.recordNormalizedChunk(turn, 'text', { messageUuid: 'message-before-bind', text: 'before bind' });
    service.recordSdkMessage(turn, { type: 'assistant', uuid: 'message-before-bind-2' });
    service.recordNormalizedChunk(turn, 'thinking', { messageUuid: 'message-before-bind-2', text: 'still before bind' });
    await service.store.flush();
    expect(await service.store.readTrace(turn.traceId)).toHaveLength(0);

    const bound = service.bindSession({
      sessionId: 'sdk-replay',
      provisionalId: 'provisional-replay',
      resumed: false,
      via: 'sdk',
    });
    service.recordSdkMessage(bound, { type: 'result', uuid: 'message-after-bind' });
    service.finishTurn(bound, 'completed');
    await service.store.flush();

    const events = await service.store.readTrace('sdk-replay');
    const names = events.map((event) => event.name);
    expect(names).toEqual(expect.arrayContaining([
      'turn.started',
      'sdk.message.assistant',
      'stream.chunk.text',
      'stream.chunk.thinking',
      'sdk.message.result',
      'turn.finished',
    ]));
    const started = names.indexOf('turn.started');
    const firstSdk = names.indexOf('sdk.message.assistant');
    const firstChunk = names.indexOf('stream.chunk.text');
    const secondChunk = names.indexOf('stream.chunk.thinking');
    const result = names.indexOf('sdk.message.result');
    const finished = names.indexOf('turn.finished');
    expect(started).toBeLessThan(firstSdk);
    expect(firstSdk).toBeLessThan(firstChunk);
    expect(firstChunk).toBeLessThan(secondChunk);
    expect(secondChunk).toBeLessThan(result);
    expect(result).toBeLessThan(finished);
    expect(events.every((event) => event.traceId === 'sdk-replay')).toBe(true);
    expect(events.every((event) => event.sessionId === 'sdk-replay')).toBe(true);
  });

  it('defers a pre-bind retroactive ring flush until it can replay on the SDK trace', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-prebind-retro',
      turnId: 'turn-prebind-retro',
      provisional: true,
    });
    const provisionalTraceId = turn.traceId;
    service.recordSdkMessage(turn, {
      type: 'assistant',
      uuid: 'message-prebind-retro',
      message: { content: 'before durable SDK session id' },
    });
    service.flushRingBuffer('provisional-prebind-retro', 'manual-prebind');
    await service.store.flush();

    expect(await service.store.readTrace(provisionalTraceId)).toHaveLength(0);
    const deepDirectory = path.join(service.store.rootDirectory, 'v1', 'deep');
    expect(fs.readdirSync(deepDirectory).filter((file) => file.endsWith('.jsonl'))).toHaveLength(0);

    const bound = service.bindSession({
      sessionId: 'sdk-prebind-retro',
      provisionalId: 'provisional-prebind-retro',
      resumed: false,
      via: 'sdk',
    });
    await service.store.flush();

    const structural = await service.store.readTrace(bound.traceId);
    expect(structural.map((event) => event.name)).toEqual(expect.arrayContaining([
      'session.bound',
      'turn.started',
      'sdk.message.assistant',
    ]));
    expect(structural.every((event) => event.traceId === 'sdk-prebind-retro')).toBe(true);
    expect(structural.every((event) => event.sessionId === 'sdk-prebind-retro')).toBe(true);
    expect(await service.store.readTrace(provisionalTraceId)).toHaveLength(0);

    const deepFiles = fs.readdirSync(deepDirectory).filter((file) => file.endsWith('.jsonl'));
    expect(deepFiles).toHaveLength(1);
    const deepEvents = fs.readFileSync(path.join(deepDirectory, deepFiles[0]!), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { name: string; traceId?: string; sessionId?: string });
    expect(deepEvents.some((event) => event.name === 'trace.retroactive')).toBe(true);
    expect(deepEvents.every((event) => event.traceId === 'sdk-prebind-retro')).toBe(true);
    expect(deepEvents.every((event) => event.sessionId === 'sdk-prebind-retro')).toBe(true);
  });

  it('does not defer an event whose cloned context belongs to a different turn', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-turn-isolation',
      turnId: 'turn-active',
      provisional: true,
    });
    const otherTurn = { ...turn, turnId: 'turn-other' };
    service.recordSdkMessage(otherTurn, { type: 'assistant', uuid: 'message-other-turn' });
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'sdk.message.assistant',
        sessionId: 'provisional-turn-isolation',
        turnId: 'turn-other',
      }),
    ]));
  });

  it('continues the provisional watchdog on the SDK session after binding', async () => {
    jest.useFakeTimers();
    try {
      service.beginTurn({
        sessionId: 'provisional-watchdog',
        turnId: 'turn-watchdog',
        provisional: true,
      });
      service.bindSession({
        sessionId: 'sdk-watchdog',
        provisionalId: 'provisional-watchdog',
        resumed: false,
        via: 'sdk',
      });

      jest.advanceTimersByTime(60_000);
      await service.store.flush();
      const warningEvents = await service.store.readTrace('sdk-watchdog');
      expect(warningEvents.some((event) =>
        event.name === 'turn.stalled' && event.severity === 'warning')).toBe(true);

      jest.advanceTimersByTime(120_000);
      await service.store.flush();
      const terminal = (await service.store.readTrace('sdk-watchdog'))
        .find((event) => event.name === 'turn.finished');
      expect((terminal?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps SDK payloads out of structural events until a deep capture is claimed', async () => {
    const turn = service.beginTurn({ sessionId: 'sdk-session-shape', turnId: 'turn-shape' });
    service.recordSdkMessage(turn, { type: 'assistant', message: { content: 'must-not-be-structural' } });
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    const sdk = events.find((event) => event.name === 'sdk.message.assistant');
    expect(JSON.stringify(sdk?.payload)).not.toContain('must-not-be-structural');
    service.finishTurn(turn, 'completed');
  });

  it('flushes redacted SDK ring evidence retroactively for send failures', async () => {
    const secret = 'claude-send-failure-secret';
    await service.dispose();
    service = new ClaudeSessionTraceService({
      settings: () => traceSettings(dir),
      knownSecrets: () => [secret],
    });
    const turn = service.beginTurn({ sessionId: 'sdk-session-error', turnId: 'turn-error' });
    service.recordSdkMessage(turn, { type: 'assistant', message: { content: secret } });
    service.recordTurnEvent(turn, 'turn.send_failed', 'error', { message: secret });
    service.finishTurn(turn, 'error');
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    const retroactive = events.filter((event) => event.name === 'trace.retroactive');
    expect(retroactive.length).toBeGreaterThan(0);
    expect(retroactive.every((event) => event.payloadRef?.kind === 'deep')).toBe(true);
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('defers pre-bind retroactive error evidence until the SDK trace is bound', async () => {
    const turn = service.beginTurn({
      sessionId: 'provisional-retroactive',
      turnId: 'turn-provisional-retroactive',
      provisional: true,
    });
    service.recordSdkMessage(turn, {
      type: 'assistant',
      uuid: 'before-bind',
      message: { content: 'ring-before-bind' },
    });
    service.recordTurnEvent(turn, 'turn.send_failed', 'error', { phase: 'stream' });
    await service.store.flush();

    expect(await service.store.readTrace(turn.traceId)).toHaveLength(0);

    const bound = service.bindSession({
      sessionId: 'sdk-retroactive',
      provisionalId: 'provisional-retroactive',
      resumed: false,
      via: 'sdk',
    });
    service.finishTurn(bound, 'error');
    await service.store.flush();

    const events = await service.store.readTrace(bound.traceId);
    expect(events.every((event) => event.traceId === 'sdk-retroactive')).toBe(true);
    expect(events.some((event) => event.name === 'trace.retroactive' && event.payloadRef?.kind === 'deep')).toBe(true);
    expect(events.some((event) => event.name === 'turn.send_failed')).toBe(true);
  });

  it('records SDK error evidence and never records its terminal state as completed', async () => {
    const turn = service.beginTurn({ sessionId: 'sdk-session-sdk-error', turnId: 'turn-sdk-error' });
    service.recordSdkMessage(turn, { type: 'result', subtype: 'error', is_error: true, uuid: 'sdk-error-1' });
    service.finishTurn(turn, 'error');
    await service.store.flush();

    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.error_evidence' && event.severity === 'error')).toBe(true);
    const terminal = events.filter((event) => event.name === 'turn.finished');
    expect(terminal).toHaveLength(1);
    expect((terminal[0]?.payload as { state?: string }).state).toBe('error');
    expect(terminal.some((event) => (event.payload as { state?: string }).state === 'completed')).toBe(false);
  });

  it('captures full redacted payloads for claimed deep runs and expires the run after 30 minutes', async () => {
    jest.useFakeTimers();
    try {
      const secret = 'claude-deep-secret';
      await service.dispose();
      service = new ClaudeSessionTraceService({ settings: () => traceSettings(dir), knownSecrets: () => [secret] });
      service.bindSession({ sessionId: 'sdk-session-deep', resumed: false, via: 'sdk', tabId: 'tab-deep' });
      service.armDeepCapture('tab-deep', 'sdk-session-deep');
      const token = service.claimDeepCapture('tab-deep', 'sdk-session-deep');
      expect(token).toBeDefined();
      const turn = service.beginTurn({
        sessionId: 'sdk-session-deep',
        turnId: 'turn-deep',
        tabId: 'tab-deep',
        diagnosticRunToken: token,
      });
      service.recordSdkMessage(turn, { type: 'assistant', message: { content: secret } });
      // Keep the turn alive so the capture TTL, rather than the 180s stall
      // watchdog, owns the terminal state.
      for (let elapsed = 0; elapsed < 1_750_000; elapsed += 50_000) {
        jest.advanceTimersByTime(50_000);
        service.recordSdkMessage(turn, { type: 'assistant', message: { content: secret } });
      }
      jest.advanceTimersByTime(50_000);
      await service.store.flush();

      const deep = await service.store.readDeepRun(token?.runId as string);
      expect(JSON.stringify(deep)).not.toContain(secret);
      expect(deep.some((event) => event.name === 'sdk.message.assistant')).toBe(true);
      expect(deep.some((event) => event.name === 'anomaly.capture_expired')).toBe(true);
      const terminal = deep.find((event) => event.name === 'turn.finished');
      expect((terminal?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
      expect(service.getCaptureState('tab-deep')).toBe('off');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not persist or arm watchdog state while diagnostics are disabled', async () => {
    await service.dispose();
    const disabledDirectory = path.join(dir, 'disabled-trace');
    let enabled = false;
    service = new ClaudeSessionTraceService({ settings: () => ({ ...traceSettings(disabledDirectory), enabled }) });
    const turn = service.beginTurn({ sessionId: 'sdk-session-disabled', turnId: 'turn-disabled', provisional: true });
    service.recordSdkMessage(turn, { type: 'assistant', message: { content: 'must-not-survive-disabled' } });
    await service.store.flush();
    expect(fs.existsSync(disabledDirectory)).toBe(false);

    jest.useFakeTimers();
    try {
      enabled = true;
      const bound = service.bindSession({ sessionId: 'sdk-session-disabled', resumed: false, via: 'sdk' });
      jest.advanceTimersByTime(180_000);
      await service.store.flush();
      const events = await service.store.readTrace(bound.traceId);
      expect(events.some((event) => event.name === 'turn.stalled')).toBe(false);
      expect(JSON.stringify(events)).not.toContain('must-not-survive-disabled');
    } finally {
      jest.useRealTimers();
    }
  });

  it('redacts apiKey, token, and absolute-path canaries from persisted events, reports, and exports', async () => {
    const apiKey = 'claude-api-key-canary';
    const token = 'claude-token-canary';
    const vaultPath = '/Volumes/SDD2T/obsidian-vault-write/testvault';
    await service.dispose();
    service = new ClaudeSessionTraceService({
      settings: () => traceSettings(dir),
      vaultPath,
      knownSecrets: () => [apiKey, token],
    });
    service.bindSession({ sessionId: 'sdk-session-redaction', resumed: false, via: 'sdk', tabId: 'tab-redaction' });
    service.armDeepCapture('tab-redaction', 'sdk-session-redaction');
    const diagnosticRunToken = service.claimDeepCapture('tab-redaction', 'sdk-session-redaction');
    const turn = service.beginTurn({
      sessionId: 'sdk-session-redaction',
      tabId: 'tab-redaction',
      diagnosticRunToken,
    });
    service.recordSdkMessage(turn, {
      type: 'assistant',
      apiKey,
      token,
      absolutePath: `${vaultPath}/private.md`,
      message: { content: `Bearer ${token}` },
    });
    await service.store.flush();

    const persisted = JSON.stringify(await service.store.readTrace(turn.traceId));
    const sourceDeepPath = path.join(service.store.rootDirectory, 'v1', 'deep', `${diagnosticRunToken?.runId}.jsonl`);
    const sourceDeep = fs.readFileSync(sourceDeepPath, 'utf8');
    expect(sourceDeep).toContain('[REDACTED]');
    expect(sourceDeep).toContain('$VAULT/private.md');
    const report = await service.buildSmartReport(turn.traceId);
    const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-export-'));
    try {
      const bundle = await service.exportTrace(turn.traceId, exportRoot);
      expect(bundle).toBeDefined();
      const exported = fs.readFileSync(path.join(bundle as string, 'structural.jsonl'), 'utf8');
      const exportedDeepFiles = fs.readdirSync(bundle as string)
        .filter((file) => /^deep-.*\.jsonl$/.test(file));
      expect(exportedDeepFiles).toHaveLength(1);
      const exportedDeep = exportedDeepFiles.map((file) => fs.readFileSync(path.join(bundle as string, file), 'utf8'));
      expect(exportedDeep[0]).toContain('[REDACTED]');
      expect(exportedDeep[0]).toContain('$VAULT/private.md');
      for (const content of [persisted, report, sourceDeep, exported, ...exportedDeep]) {
        expect(content).not.toContain(apiKey);
        expect(content).not.toContain(token);
        expect(content).not.toContain(vaultPath);
      }
    } finally {
      fs.rmSync(exportRoot, { recursive: true, force: true });
    }
  });
});
