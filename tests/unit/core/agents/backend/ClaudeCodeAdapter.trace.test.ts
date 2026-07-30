import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ClaudeCodeAdapter, type ClaudeCodeSdkFacade } from '../../../../../src/core/agents/backend';
import {
  CLAUDE_TRACE_CHANNEL_IDS,
  ClaudeSessionTraceService,
  type ClaudeSessionTraceSettings,
  type ClaudeTraceContext,
  type ClaudeTracePort,
} from '../../../../../src/core/agents/backend/diagnostics';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';
import {
  clearRecentLogs,
  getRecentLogEntries,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
} from '../../../../../src/shared';

async function collectAsync<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

function createAsyncQueue<T>(): AsyncIterable<T> & { push(value: T): void; close(): void } {
  const values: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;
  return {
    push(value): void {
      const waiter = waiters.shift();
      if (waiter) waiter({ value, done: false });
      else values.push(value);
    },
    close(): void {
      closed = true;
      for (const waiter of waiters.splice(0)) waiter({ value: undefined, done: true });
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          const value = values.shift();
          if (value !== undefined) return Promise.resolve({ value, done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}

async function waitForExpect(assertion: () => void, attempts = 20): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await Promise.resolve();
    }
  }
  throw lastError;
}

function assistantMessage(sessionId = 'sdk-session-1', text = 'hello'): Record<string, unknown> {
  return { type: 'assistant', session_id: sessionId, uuid: 'message-1', content: [{ type: 'text', text }] };
}

function resultMessage(sessionId = 'sdk-session-1', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'result', subtype: 'success', session_id: sessionId, ...extra };
}

function createSdk(messages: unknown[]): ClaudeCodeSdkFacade & { query: jest.Mock } {
  return {
    query: jest.fn(() => Object.assign((async function* () {
      for (const message of messages) yield message;
    })(), { close: jest.fn(), interrupt: jest.fn().mockResolvedValue(undefined) })),
  } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock };
}

function createTracePort(): jest.Mocked<ClaudeTracePort> {
  const provisional: ClaudeTraceContext = {
    traceId: 'provisional-trace', runtimeSegmentId: 'segment-1', sessionId: 'local-session',
  };
  return {
    bindSession: jest.fn(({ sessionId }) => ({
      traceId: sessionId,
      runtimeSegmentId: 'segment-1',
      sessionId,
    })),
    beginTurn: jest.fn(() => provisional),
    recordSdkMessage: jest.fn(),
    recordNormalizedChunk: jest.fn(),
    recordTurnEvent: jest.fn(),
    finishTurn: jest.fn(),
    recordLifecycle: jest.fn(),
    recordPermission: jest.fn(),
    recordElicitation: jest.fn(),
    recordPersistence: jest.fn(),
    armDeepCapture: jest.fn(),
    claimDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn(),
    getCaptureState: jest.fn(() => 'off'),
    flushRingBuffer: jest.fn(),
    resolveTraceId: jest.fn(),
    buildSmartReport: jest.fn(),
    exportTrace: jest.fn(),
    clearAll: jest.fn(),
    getStorageStatus: jest.fn(),
    listRecentTraces: jest.fn(),
  } as unknown as jest.Mocked<ClaudeTracePort>;
}

function traceSettings(storageDirectory: string): ClaudeSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'off',
    consoleChannels: Object.fromEntries(CLAUDE_TRACE_CHANNEL_IDS.map((id) => [id, false])) as ClaudeSessionTraceSettings['consoleChannels'],
    storageDirectory,
  };
}

function createAdapter(tracePort: ClaudeTracePort | undefined, sdk: ClaudeCodeSdkFacade): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    vaultPath: '/vault',
    settings: getDefaultClaudeCodeBackendSettings(),
    sdk,
    ...(tracePort ? { tracePort } : {}),
  });
}

describe('ClaudeCodeAdapter trace instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    clearRecentLogs();
  });

  it('opens a provisional turn at input push, then binds the SDK session before recording SDK and normalized events', async () => {
    const tracePort = createTracePort();
    const adapter = createAdapter(tracePort, createSdk([
      assistantMessage('sdk-session-1'),
      resultMessage('sdk-session-1'),
    ]));
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }))).resolves.toEqual([
      { type: 'text', content: 'hello' },
    ]);

    expect(tracePort.beginTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      provisional: true,
      conversationId: sessionId,
    }));
    expect(tracePort.bindSession).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sdk-session-1',
      provisionalId: sessionId,
      via: 'sdk',
    }));
    const boundContext = tracePort.bindSession.mock.results[0]?.value as ClaudeTraceContext;
    expect(tracePort.recordSdkMessage).toHaveBeenCalledWith(boundContext, expect.objectContaining({ type: 'assistant' }));
    expect(tracePort.recordNormalizedChunk).toHaveBeenCalledWith(boundContext, 'text', expect.objectContaining({ type: 'text' }));
    expect(tracePort.finishTurn).toHaveBeenCalledWith(boundContext, 'completed', expect.objectContaining({ sawChunk: true }));

    const beginOrder = tracePort.beginTurn.mock.invocationCallOrder[0]!;
    const bindOrder = tracePort.bindSession.mock.invocationCallOrder[0]!;
    const sdkOrder = tracePort.recordSdkMessage.mock.invocationCallOrder[0]!;
    const chunkOrder = tracePort.recordNormalizedChunk.mock.invocationCallOrder[0]!;
    const finishOrder = tracePort.finishTurn.mock.invocationCallOrder[0]!;
    expect(beginOrder).toBeLessThan(bindOrder);
    expect(bindOrder).toBeLessThan(sdkOrder);
    expect(sdkOrder).toBeLessThan(chunkOrder);
    expect(chunkOrder).toBeLessThan(finishOrder);
  });

  it('replays SDK envelopes that precede a late SDK session id onto the eventual SDK trace', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-adapter-late-id-'));
    const traceService = new ClaudeSessionTraceService({ settings: () => traceSettings(directory) });
    const adapter = createAdapter(traceService, createSdk([
      { type: 'system', subtype: 'hook_started' },
      { type: 'assistant', uuid: 'assistant-before-id', content: [{ type: 'text', text: 'TRACE_OK.' }] },
      resultMessage('sdk-session-late-id'),
    ]));
    try {
      const localSessionId = await adapter.createSession();
      await expect(collectAsync(adapter.sendMessage({ sessionId: localSessionId, content: 'hello' }))).resolves.toEqual(expect.arrayContaining([
        { type: 'text', content: 'TRACE_OK.' },
      ]));
      await traceService.store.flush();

      const events = await traceService.store.readTrace('sdk-session-late-id');
      const names = events.map((event) => event.name);
      expect(names).toEqual(expect.arrayContaining([
        'turn.started',
        'sdk.message.system',
        'sdk.message.assistant',
        'sdk.message.result',
        'turn.finished',
      ]));
      expect(names.indexOf('turn.started')).toBeLessThan(names.indexOf('sdk.message.system'));
      expect(names.indexOf('sdk.message.system')).toBeLessThan(names.indexOf('sdk.message.assistant'));
      expect(names.indexOf('sdk.message.assistant')).toBeLessThan(names.indexOf('sdk.message.result'));
      expect(names.indexOf('sdk.message.result')).toBeLessThan(names.indexOf('turn.finished'));
      expect(events.every((event) => event.traceId === 'sdk-session-late-id')).toBe(true);
      expect(events.every((event) => event.sessionId === 'sdk-session-late-id')).toBe(true);
    } finally {
      await traceService.dispose();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('finishes an SDK error result and normalized error chunk as error, never completed', async () => {
    const tracePort = createTracePort();
    const adapter = createAdapter(tracePort, createSdk([
      resultMessage('sdk-error-session', { is_error: true, error: 'backend rejected request' }),
    ]));
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }))).resolves.toEqual([
      { type: 'error', content: 'backend rejected request' },
    ]);

    const context = tracePort.bindSession.mock.results[0]?.value as ClaudeTraceContext;
    expect(tracePort.recordNormalizedChunk).toHaveBeenCalledWith(context, 'error', expect.objectContaining({ type: 'error' }));
    expect(tracePort.finishTurn).toHaveBeenCalledWith(context, 'error', expect.objectContaining({ error: true }));
    expect(tracePort.finishTurn).not.toHaveBeenCalledWith(context, 'completed', expect.anything());
  });

  it('records terminal error evidence for SDK output failures and runtime-creation throws', async () => {
    const outputTrace = createTracePort();
    const outputSdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => (async function* () {
        yield { type: 'system', subtype: 'unrelated' };
        throw new Error('output failed');
      })()),
    } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock };
    const outputAdapter = createAdapter(outputTrace, outputSdk);
    const outputSessionId = await outputAdapter.createSession();

    await expect(collectAsync(outputAdapter.sendMessage({ sessionId: outputSessionId, content: 'hello' })))
      .resolves.toEqual([{ type: 'error', content: 'Claude Code stream failed: output failed' }]);
    expect(outputTrace.recordTurnEvent.mock.calls.some(([, name, severity]) =>
      name === 'turn.runtime_output_error' && severity === 'error')).toBe(true);
    expect(outputTrace.recordTurnEvent).toHaveBeenCalledWith(expect.anything(), 'turn.error_evidence', 'error', expect.objectContaining({ phase: 'runtime-output' }));
    expect(outputTrace.finishTurn).toHaveBeenCalledWith(expect.anything(), 'error', expect.anything());

    const startupTrace = createTracePort();
    const startupSdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => { throw new Error('query construction failed'); }),
    } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock };
    const startupAdapter = createAdapter(startupTrace, startupSdk);
    const startupSessionId = await startupAdapter.createSession();

    await expect(collectAsync(startupAdapter.sendMessage({ sessionId: startupSessionId, content: 'hello' })))
      .resolves.toEqual([{ type: 'error', content: 'Claude Code SDK unavailable: query construction failed' }]);
    expect(startupTrace.recordTurnEvent).toHaveBeenCalledWith(expect.anything(), 'turn.send_failed', 'error', expect.objectContaining({ phase: 'runtime-ready' }));
    expect(startupTrace.finishTurn).toHaveBeenCalledWith(expect.anything(), 'error', expect.objectContaining({ phase: 'runtime-ready' }));
  });

  it('records cancellation for interrupt and deletion without preventing either operation', async () => {
    const tracePort = createTracePort();
    const output = createAsyncQueue<unknown>();
    const query = Object.assign(output, {
      interrupt: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    });
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => query),
    } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock };
    const adapter = createAdapter(tracePort, sdk);
    const sessionId = await adapter.createSession();
    const stream = adapter.sendMessage({ sessionId, content: 'hello' });
    const pending = stream.next();
    await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));

    adapter.cancelStream(sessionId);
    await expect(pending).resolves.toEqual({ value: undefined, done: true });
    expect(query.interrupt).toHaveBeenCalledTimes(1);
    expect(tracePort.recordTurnEvent).toHaveBeenCalledWith(expect.anything(), 'turn.cancelled', 'info', expect.objectContaining({ phase: 'cancelStream' }));
    expect(tracePort.finishTurn).toHaveBeenCalledWith(expect.anything(), 'cancelled', expect.objectContaining({ phase: 'cancelStream' }));

    const deleteSessionId = await adapter.createSession();
    await expect(adapter.deleteSession(deleteSessionId)).resolves.toBeUndefined();
    expect(tracePort.recordPersistence).toHaveBeenCalledWith(undefined, 'delete', expect.objectContaining({ sessionId: deleteSessionId }));
  });

  it('leaves the ordinary send path unchanged when no tracePort is supplied', async () => {
    const adapter = createAdapter(undefined, createSdk([
      assistantMessage(),
      resultMessage(),
    ]));
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }))).resolves.toEqual([
      { type: 'text', content: 'hello' },
    ]);
  });

  it('contains every throwing trace hook without blocking sends or logging the fault to the Claude runtime channel', async () => {
    const tracePort = createTracePort();
    for (const method of [
      'bindSession', 'beginTurn', 'recordSdkMessage', 'recordNormalizedChunk', 'recordTurnEvent',
      'finishTurn', 'recordLifecycle', 'recordPersistence',
    ] as const) {
      tracePort[method].mockImplementation(() => { throw new Error('sk-trace-canary /vault/secret'); });
    }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const adapter = createAdapter(tracePort, createSdk([
      assistantMessage(),
      resultMessage(),
    ]));
    const sessionId = await adapter.createSession();

    await expect(adapter.start()).resolves.toBeUndefined();
    await expect(collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }))).resolves.toEqual([
      { type: 'text', content: 'hello' },
    ]);
    await expect(adapter.deleteSession(sessionId)).resolves.toBeUndefined();

    const allLogText = getRecentLogEntries().map((entry) => entry.message).join('\n');
    const runtimeTraceFaults = getRecentLogEntries().filter((entry) =>
      entry.scope === 'ClaudeCodeAdapter' && entry.channel === 'runtime' && entry.message.includes('trace hook failed'));
    expect(allLogText).not.toContain('sk-trace-canary');
    expect(allLogText).not.toContain('/vault/secret');
    expect(runtimeTraceFaults).toEqual([]);
    warn.mockRestore();
  });
});
