/* eslint-disable max-lines-per-function -- One shared transport fixture covers the full live stream/cancel lifecycle, including abandoned iterators. */
/**
 * ZCodeAdapter.chat.test.ts — cancellable streaming conversation slice.
 *
 * Covers send → stream mapping → finalization, cancel semantics (native
 * stop + closed stream + usable session), concurrent session de-multiplexing,
 * and scoped failure normalization (send rejection, process exit mid-turn).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';
import type { StreamChunk } from '../../../../../src/core/types/chat';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/cli/config.json',
  state: 'validated',
  providerCount: 1,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent',
    args: ['app-server', '--stdio'],
    entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent',
    source: 'app-bundled',
    extraEnv: {},
  },
};

interface FakeTransport {
  request: jest.Mock<(method: string, params?: Record<string, unknown>) => Promise<unknown>>;
  onNotification: (method: string, handler: (params: Record<string, unknown>) => void) => { dispose: () => void };
  onServerRequest: (method: string, handler: (params: Record<string, unknown>) => unknown) => { dispose: () => void };
  emitSessionEvent: (params: Record<string, unknown>) => void;
  serverHandlers: Map<string, (params: Record<string, unknown>) => unknown>;
  sendBehavior: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

function createFakeTransport(): FakeTransport {
  const notificationHandlers = new Map<string, (params: Record<string, unknown>) => void>();
  const serverHandlers = new Map<string, (params: Record<string, unknown>) => unknown>();
  const fake: FakeTransport = {
    request: jest.fn(async (method: string, params?: Record<string, unknown>) => fake.sendBehavior(method, params)),
    onNotification: (method, handler) => {
      notificationHandlers.set(method, handler);
      return { dispose: () => { notificationHandlers.delete(method); } };
    },
    onServerRequest: (method, handler) => {
      serverHandlers.set(method, handler);
      return { dispose: () => { serverHandlers.delete(method); } };
    },
    emitSessionEvent: (params) => { notificationHandlers.get('session/event')?.(params); },
    serverHandlers,
    sendBehavior: async (method) => {
      if (method === 'session/subscribe') return { eventSeq: 0, events: [], sessionId: '' };
      if (method === 'session/send') return { accepted: true, sessionId: '', stateRevision: 1 };
      if (method === 'session/stop') return {};
      if (method === 'session/create') return { session: { sessionId: 'sess_native_1' } };
      return {};
    },
  };
  return fake;
}

function tick(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function collect(generator: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('ZCodeAdapter — cancellable streaming chat', () => {
  let fake: FakeTransport;
  let capturedTransportOptions: ConstructorParameters<typeof ZCodeAppServerTransport>[0] | null;
  let adapter: ZCodeAdapter;

  async function startAdapter(): Promise<void> {
    fake = createFakeTransport();
    capturedTransportOptions = null;
    adapter = new ZCodeAdapter({
      workingDirectory: '/vault',
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: (options) => {
        capturedTransportOptions = options;
        return {
          start: jest.fn(async () => {}),
          request: fake.request,
          dispose: jest.fn(),
          onNotification: fake.onNotification,
          onServerRequest: fake.onServerRequest,
        } as unknown as ZCodeAppServerTransport;
      },
    });
    await adapter.start();
  }

  afterEach(() => {
    adapter.dispose();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await startAdapter();
  });

  it('answers the runtime materialization asks so session/create cannot deadlock', () => {
    const preferences = fake.serverHandlers.get('session/requestRuntimePreferences');
    const mcpAuth = fake.serverHandlers.get('interaction/requestOfficialMcpAuthHeaders');
    expect(preferences?.({ sessionId: 's', scope: 'runtime-materialization' })).toEqual({
      nativeSearchEnhancementsEnabled: false,
    });
    expect(mcpAuth?.({ mcpKey: 'image_search' })).toEqual({ headers: {} });
  });

  it('maps a streamed turn to the stream contract and closes with the finalization boundary', async () => {
    const chunksPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' }));
    await tick();
    const methods = fake.request.mock.calls.map(([method]) => method);
    expect(methods.indexOf('session/resume')).toBeGreaterThanOrEqual(0);
    expect(methods.indexOf('session/resume')).toBeLessThan(methods.indexOf('session/subscribe'));
    expect(fake.request).toHaveBeenCalledWith('session/subscribe', {
      sessionId: 'sess_a',
      deliveryKind: 'desktop-continuous',
    });
    expect(fake.request).toHaveBeenCalledWith('session/send', { sessionId: 'sess_a', content: 'hi' });

    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: { messageId: 'u1' } });
    fake.emitSessionEvent({ type: 'model.streaming', seq: 2, sessionId: 'sess_a', payload: { delta: 'OK', kind: 'text_delta', assistantMessageId: 'a1' } });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 3, sessionId: 'sess_a', payload: {
      response: 'OK', tokenCount: 10, usage: { inputTokens: 8, outputTokens: 2, reasoningTokens: 1 }, duration: 100, resultType: 'success',
    } });

    const chunks = await chunksPromise;
    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'text', content: 'OK' },
      expect.objectContaining({ type: 'usage', inputTokens: 8, outputTokens: 2 }),
      { type: 'user_message_identity', uuid: 'u1', sessionId: 'sess_a' },
      { type: 'message_metadata', messageId: 'a1', timestamp: expect.any(Number), sessionId: 'sess_a' },
      { type: 'message_stop' },
    ]);
  });

  it('dispatches /goal through native goal state and verifies the same-session target', async () => {
    const objective = 'Reply GOAL_OK without tools';
    const original = fake.sendBehavior;
    fake.sendBehavior = async (method, params) => {
      if (method === 'session/goal') return { response: 'Goal active', startedTurn: true };
      if (method === 'session/read') return { projection: { target: { sessionId: 'sess_a', objective, targetId: 'target_goal_1' } } };
      return original(method, params);
    };
    const chunksPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: `/goal ${objective}` }));
    await tick();
    expect(fake.request).toHaveBeenCalledWith('session/goal', {
      sessionId: 'sess_a', action: 'set', objective,
    });
    expect(fake.request.mock.calls.some(([method]) => method === 'session/send')).toBe(false);
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: { executionKind: 'controlOnly' } });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 2, sessionId: 'sess_a', payload: { response: '', usage: {} } });
    fake.emitSessionEvent({ type: 'turn.started', seq: 3, sessionId: 'sess_a', payload: { targetId: 'target_goal_1' } });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 4, sessionId: 'sess_a', payload: { response: 'GOAL_OK', usage: {} } });
    expect(await chunksPromise).toContainEqual({ type: 'text', content: 'GOAL_OK' });
  });

  it('rejects a goal acknowledgement when the native target belongs to another session', async () => {
    const original = fake.sendBehavior;
    fake.sendBehavior = async (method, params) => {
      if (method === 'session/goal') return { response: 'Goal active', startedTurn: true };
      if (method === 'session/read') return { projection: { target: {
        sessionId: 'sess_other', objective: 'Reply GOAL_OK', targetId: 'target_other',
      } } };
      return original(method, params);
    };
    await expect(collect(adapter.sendMessage({ sessionId: 'sess_a', content: '/goal Reply GOAL_OK' })))
      .rejects.toThrow('readback did not confirm');
    expect(fake.request.mock.calls.some(([method]) => method === 'session/send')).toBe(false);
  });

  it('confirms /plan over a YOLO base mode without sending an empty model prompt', async () => {
    const original = fake.sendBehavior;
    fake.sendBehavior = async (method, params) => {
      if (method === 'session/read') return { settings: { mode: { current: 'yolo' } } };
      if (method === 'session/events') return { events: [{
        sessionId: 'sess_a', payload: { mode: 'yolo', previousMode: 'yolo', planEnabled: true, previousPlanEnabled: false },
      }] };
      return original(method, params);
    };
    const chunks = await collect(adapter.sendMessage({ sessionId: 'sess_a', content: '/plan' }));
    expect(fake.request).toHaveBeenCalledWith('session/setMode', { sessionId: 'sess_a', mode: 'plan' });
    expect(fake.request.mock.calls.some(([method]) => method === 'session/send')).toBe(false);
    expect(chunks).toContainEqual({ type: 'text', content: 'PLAN' });
  });

  it('reports a verified /compact result without a fake model send', async () => {
    jest.spyOn(adapter, 'compactSession').mockResolvedValue({
      acknowledged: true, completed: true, tokenUsageObserved: true,
      operationId: 'cmp_test', terminalStatus: 'completed',
    });
    const chunks = await collect(adapter.sendMessage({ sessionId: 'sess_a', content: '/compact' }));
    expect(fake.request.mock.calls.some(([method]) => method === 'session/send')).toBe(false);
    expect(chunks).toContainEqual({ type: 'text', content: 'completed' });
  });

  it('de-multiplexes concurrent sessions and keeps their streams independent', async () => {
    const first = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'one' }));
    const second = collect(adapter.sendMessage({ sessionId: 'sess_b', content: 'two' }));
    await tick();

    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_b', payload: {} });
    fake.emitSessionEvent({ type: 'model.streaming', seq: 2, sessionId: 'sess_b', payload: { delta: 'B', kind: 'text_delta' } });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 3, sessionId: 'sess_b', payload: { response: 'B', usage: {} } });
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'model.streaming', seq: 2, sessionId: 'sess_a', payload: { delta: 'A', kind: 'text_delta' } });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 3, sessionId: 'sess_a', payload: { response: 'A', usage: {} } });

    const [firstChunks, secondChunks] = await Promise.all([first, second]);
    expect(firstChunks.find((chunk) => chunk.type === 'text')).toEqual({ type: 'text', content: 'A' });
    expect(secondChunks.find((chunk) => chunk.type === 'text')).toEqual({ type: 'text', content: 'B' });
  });

  it('cancel stops the native turn, closes the stream, and leaves the session usable', async () => {
    const chunksPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' }));
    await tick();
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'model.streaming', seq: 2, sessionId: 'sess_a', payload: { delta: 'partial', kind: 'text_delta' } });

    await adapter.cancelStream('sess_a');
    expect(fake.request).toHaveBeenCalledWith('session/stop', { sessionId: 'sess_a' });

    const chunks = await chunksPromise;
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
    // Cancelled turns do not fabricate identity/evidence after the cutoff.
    expect(chunks.some((chunk) => chunk.type === 'user_message_identity')).toBe(false);

    // Retry after cancel: the session accepts a subsequent prompt again.
    const retryPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'again' }));
    await tick();
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 2, sessionId: 'sess_a', payload: { response: 'ok', usage: {} } });
    const retryChunks = await retryPromise;
    expect(retryChunks.find((chunk) => chunk.type === 'text')).toEqual({ type: 'text', content: 'ok' });
    expect(retryChunks.at(-1)).toEqual({ type: 'message_stop' });
  });

  it('allows a new turn when the cancelled UI iterator remains suspended at a yield', async () => {
    const oldIterator = adapter.sendMessage({ sessionId: 'sess_a', content: 'first' });
    const firstChunk = oldIterator.next();
    await tick();
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    await expect(firstChunk).resolves.toMatchObject({ value: { type: 'message_start' } });

    await adapter.cancelStream('sess_a');
    const retry = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'second' }));
    await tick();
    expect(fake.request).toHaveBeenCalledWith('session/send', { sessionId: 'sess_a', content: 'second' });

    // The abandoned iterator's late finally must not remove the new run.
    await oldIterator.return(undefined);
    await expect(collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'third' })))
      .rejects.toThrow('ZCode session is busy.');
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 2, sessionId: 'sess_a', payload: { response: 'SECOND_OK', usage: {} } });
    expect(await retry).toContainEqual({ type: 'text', content: 'SECOND_OK' });
  });

  it('waits for the native stop acknowledgement before retrying a cancelled session', async () => {
    let acknowledgeStop!: () => void;
    const stopAck = new Promise<void>((resolve) => { acknowledgeStop = resolve; });
    const defaultBehavior = fake.sendBehavior;
    fake.sendBehavior = async (method, params) => method === 'session/stop'
      ? stopAck.then(() => ({})) : defaultBehavior(method, params);
    const oldIterator = adapter.sendMessage({ sessionId: 'sess_a', content: 'first' });
    const firstChunk = oldIterator.next();
    await tick();
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    await firstChunk;

    const stopping = adapter.cancelStream('sess_a');
    const retry = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'second' }));
    await tick();
    expect(fake.request).not.toHaveBeenCalledWith('session/send', { sessionId: 'sess_a', content: 'second' });
    acknowledgeStop();
    await stopping;
    await tick();
    expect(fake.request).toHaveBeenCalledWith('session/send', { sessionId: 'sess_a', content: 'second' });
    await oldIterator.return(undefined);
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'turn.completed', seq: 2, sessionId: 'sess_a', payload: { response: 'OK', usage: {} } });
    expect(await retry).toContainEqual({ type: 'text', content: 'OK' });
  });

  it('rejects a second concurrent send on the same session as busy', async () => {
    const first = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' }));
    await tick();
    await expect(collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'again' })))
      .rejects.toThrow('ZCode session is busy.');
    await adapter.cancelStream('sess_a');
    await first;
  });

  it('normalizes a protocol failure into a scoped error and keeps the session reusable', async () => {
    fake.sendBehavior = async (method) => {
      if (method === 'session/send') {
        throw new Error('ZCode request "session/send" failed: Invalid params');
      }
      return {};
    };
    await expect(collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' })))
      .rejects.toThrow('session/send');

    fake.sendBehavior = createFakeTransport().sendBehavior;
    const retryPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'again' }));
    await tick();
    fake.emitSessionEvent({ type: 'turn.started', seq: 1, sessionId: 'sess_a', payload: {} });
    fake.emitSessionEvent({ type: 'turn.failed', seq: 2, sessionId: 'sess_a', payload: { error: { message: 'Upstream unavailable.' } } });
    const chunks = await retryPromise;
    expect(chunks).toContainEqual({ type: 'error', content: 'Upstream unavailable.' });
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
  });

  it('ends an in-flight turn honestly when the owned process exits mid-turn', async () => {
    const chunksPromise = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'hi' }));
    await tick();
    capturedTransportOptions?.onExit?.({ exitCode: 1, signal: null });
    const chunks = await chunksPromise;
    expect(chunks).toContainEqual({ type: 'error', content: 'ZCode connection closed before the turn completed.' });
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
  });

  it('rejects image sends locally without starting a turn', async () => {
    const chunks = await collect(adapter.sendMessage({
      sessionId: 'sess_a',
      content: 'hi',
      images: [{ data: 'abc', mediaType: 'image/png' }],
    }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(fake.request).not.toHaveBeenCalledWith('session/send', expect.anything());
    expect(fake.request).not.toHaveBeenCalledWith('session/subscribe', expect.anything());
  });

  it('sends a validated image in the native attachment shape when the effective model supports images', async () => {
    const image = { data: Buffer.from([137, 80, 78, 71, 1]).toString('base64'), mediaType: 'image/png' as const, filename: 'pixel.png' };
    const snapshot = {
      settings: { model: {
        available: [{ ref: { providerId: 'p', modelId: 'vision' }, label: 'Vision', properties: { inputFormat: { supportsImage: true } } }],
        current: { providerId: 'p', modelId: 'vision' },
      } },
    };
    fake.sendBehavior = async (method) => {
      if (method === 'session/resume' || method === 'session/read') return snapshot;
      if (method === 'session/subscribe') return { eventSeq: 0, events: [] };
      if (method === 'session/send') return { accepted: true, stateRevision: 1 };
      return {};
    };
    await adapter.getSession('sess_a');
    const done = collect(adapter.sendMessage({ sessionId: 'sess_a', content: 'describe', images: [image] }));
    await tick();
    expect(fake.request).toHaveBeenCalledWith('session/send', {
      sessionId: 'sess_a', content: 'describe',
      attachments: [{ kind: 'image', filename: 'pixel.png', mimeType: 'image/png', sizeBytes: 5, dataBase64: image.data }],
    });
    await adapter.cancelStream('sess_a');
    await done;
  });

  it('maps new conversations to native sessions and reports honest unavailable mutations', async () => {
    await expect(adapter.createSession('My chat')).resolves.toBe('sess_native_1');
    expect(fake.request).toHaveBeenCalledWith('session/create', {
      workspace: { workspaceKey: '/vault', workspacePath: '/vault' },
    });
    // Official V4 rename and readback are covered by the lifecycle tests.
  });

  it('fails session creation honestly when create returns no id', async () => {
    fake.sendBehavior = async (method) => (method === 'session/create' ? { session: {} } : {});
    await expect(adapter.createSession()).rejects.toThrow('no session id');
  });
});
