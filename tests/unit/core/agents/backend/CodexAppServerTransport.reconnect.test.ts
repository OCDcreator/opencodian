/**
 * Real unit tests for CodexAppServerTransport WebSocket reconnect (Codex
 * 0.159.0 hardening).
 *
 * Covers:
 *   - an unexpected close rejects in-flight requests with a clear error,
 *   - reconnect with exponential backoff re-runs the initialize handshake,
 *     keeps server-request handler registrations, and invokes onReconnect,
 *   - deliberate stop()/dispose never reconnects,
 *   - exhausting the reconnect budget invokes onReconnectFailed (fail-closed),
 *   - start() called during an outage awaits the ongoing reconnect instead of
 *     spawning a second app-server process.
 *
 * Unlike the sibling suites, the WebSocket mock creates a FRESH instance per
 * construction so reconnects can be driven instance-by-instance, and jest
 * fake timers advance the backoff delays.
 */

import type { spawn as SpawnFn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn<ReturnType<typeof SpawnFn>, Parameters<typeof SpawnFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...args: Parameters<typeof SpawnFn>) => mockSpawn(...args),
}));

interface MockWs {
  send: jest.Mock;
  close: jest.Mock;
  readyState: number;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
}

const wsInstances: MockWs[] = [];

function makeWsInstance(): MockWs {
  return {
    send: jest.fn(),
    close: jest.fn(),
    readyState: 0,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
}

const MockWebSocket = jest.fn().mockImplementation(() => {
  const instance = makeWsInstance();
  wsInstances.push(instance);
  return instance;
});

jest.mock('ws', () => MockWebSocket);

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function emitWsUrl(proc: EventEmitter) {
  proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
}

function simulateResponse(ws: MockWs, id: number, result: unknown) {
  ws.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function simulateError(ws: MockWs, id: number, error: { code: number; message: string }) {
  ws.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error }) });
}

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

/** Answer the initialize handshake for every ws instance that sends one. */
function autoAnswerInitialize(ws: MockWs): void {
  ws.send.mockImplementation((data: string) => {
    const msg = JSON.parse(data);
    if (msg.method === 'initialize') {
      simulateResponse(ws, msg.id, {});
    }
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** Start a client through the mocked spawn → ws → initialize flow. */
async function startClient(options?: ConstructorParameters<typeof CodexAppServerClient>[0]): Promise<{
  client: CodexAppServerClient;
  proc: ReturnType<typeof SpawnFn>;
}> {
  const proc = createMockProcess();
  mockSpawn.mockReturnValue(proc);
  const client = new CodexAppServerClient(options);
  const startPromise = client.start();
  await flush();
  emitWsUrl(proc.stdout!);
  await flush();
  const first = wsInstances[0];
  autoAnswerInitialize(first);
  first.onopen?.();
  first.readyState = 1;
  await startPromise;
  return { client, proc };
}

describe('CodexAppServerTransport WebSocket reconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    wsInstances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects in-flight requests with a clear error when the socket closes unexpectedly', async () => {
    const { client } = await startClient();
    const first = wsInstances[0];

    const pending = (client as unknown as {
      request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    }).request('thread/list', {}, 30000);
    await flush();
    expect(first.send).toHaveBeenCalledWith(expect.stringContaining('thread/list'));

    first.readyState = 3;
    first.onclose?.();

    await expect(pending).rejects.toThrow('App-server WebSocket closed unexpectedly; pending request aborted');
    expect(client.listThreads === client.listThreads).toBe(true);
  });

  it('reconnects with backoff, re-runs the handshake, and invokes onReconnect', async () => {
    const onReconnect = jest.fn();
    const { client } = await startClient({ onReconnect });
    const first = wsInstances[0];
    first.send.mockClear();

    // Register a server-request handler BEFORE the outage; it must survive.
    const approvalHandler = jest.fn().mockReturnValue({ decision: 'accept' });
    client.registerServerRequestHandler('item/fileChange/requestApproval', approvalHandler);

    first.readyState = 3;
    first.onclose?.();

    // First reconnect attempt waits 1s, then opens a fresh socket.
    await jest.advanceTimersByTimeAsync(999);
    expect(wsInstances).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(wsInstances).toHaveLength(2);

    const second = wsInstances[1];
    autoAnswerInitialize(second);
    second.onopen?.();
    second.readyState = 1;
    await flush();

    expect(onReconnect).toHaveBeenCalledTimes(1);

    // The reconnected transport serves requests again.
    second.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'thread/list') {
        simulateResponse(second, msg.id, { data: [{ id: 't1' }] });
      }
    });
    await expect(client.listThreads({ limit: 1 })).resolves.toEqual([{ id: 't1' }]);

    // The pre-outage handler registration still answers server requests.
    second.onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        id: 900,
        method: 'item/fileChange/requestApproval',
        params: { threadId: 't1', turnId: 'x', itemId: 'i', startedAtMs: 1 },
      }),
    });
    await flush();
    await flush();
    expect(approvalHandler).toHaveBeenCalledTimes(1);
    const lastSent = JSON.parse(second.send.mock.calls[second.send.mock.calls.length - 1][0] as string);
    expect(lastSent).toEqual({ jsonrpc: '2.0', id: 900, result: { decision: 'accept' } });
  });

  it('backs off exponentially across failed attempts before succeeding', async () => {
    const onReconnect = jest.fn();
    const { client } = await startClient({ onReconnect });
    const first = wsInstances[0];

    first.readyState = 3;
    first.onclose?.();

    // Attempt 1 at t=1s: connection refused (onerror during open).
    await jest.advanceTimersByTimeAsync(1000);
    expect(wsInstances).toHaveLength(2);
    wsInstances[1].onerror?.(new Error('refused'));

    // Attempt 2 at t=+2s.
    await jest.advanceTimersByTimeAsync(1999);
    expect(wsInstances).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(wsInstances).toHaveLength(3);
    wsInstances[2].onerror?.(new Error('refused'));

    // Attempt 3 at t=+4s succeeds.
    await jest.advanceTimersByTimeAsync(4000);
    expect(wsInstances).toHaveLength(4);
    autoAnswerInitialize(wsInstances[3]);
    wsInstances[3].onopen?.();
    wsInstances[3].readyState = 1;
    await flush();

    expect(onReconnect).toHaveBeenCalledTimes(1);
    wsInstances[3].send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'thread/list') {
        simulateResponse(wsInstances[3], msg.id, { data: [] });
      }
    });
    await expect(client.listThreads()).resolves.toEqual([]);
  });

  it('invokes onReconnectFailed once the budget is exhausted, then fails new requests closed', async () => {
    const onReconnect = jest.fn();
    const onReconnectFailed = jest.fn();
    const { client } = await startClient({ onReconnect, onReconnectFailed });
    const first = wsInstances[0];

    first.readyState = 3;
    first.onclose?.();

    // Five failed attempts at 1s/2s/4s/8s/16s.
    for (let attempt = 1; attempt <= 5; attempt++) {
      await jest.advanceTimersByTimeAsync(1000 * 2 ** (attempt - 1));
      const instance = wsInstances[wsInstances.length - 1];
      instance.onerror?.(new Error(`refused-${attempt}`));
    }
    await flush();

    expect(wsInstances).toHaveLength(6); // initial + 5 attempts
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onReconnectFailed).toHaveBeenCalledTimes(1);
    expect(onReconnectFailed.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onReconnectFailed.mock.calls[0][0] as Error).message).toEqual(expect.stringContaining('refused-5'));

    // Fail-closed: the last socket never opened, so raw requests on the dead
    // transport reject fast (any subsequent client method triggers start(),
    // which attempts a full respawn — covered by the respawn test below).
    const last = wsInstances[wsInstances.length - 1];
    last.readyState = 3;
    const deadRequest = (client as unknown as {
      request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    }).request('thread/list', {}, 30000);
    await expect(deadRequest).rejects.toThrow('WebSocket not open');
  });

});

describe('CodexAppServerTransport reconnect stop semantics', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    wsInstances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not reconnect after a deliberate stop()', async () => {
    const onReconnect = jest.fn();
    const onReconnectFailed = jest.fn();
    const { client } = await startClient({ onReconnect, onReconnectFailed });

    client.stop();

    await jest.advanceTimersByTimeAsync(60000);
    expect(wsInstances).toHaveLength(1);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onReconnectFailed).not.toHaveBeenCalled();
  });

  it('cancels a pending reconnect sleep when stop() runs mid-backoff', async () => {
    const onReconnect = jest.fn();
    const onReconnectFailed = jest.fn();
    const { client } = await startClient({ onReconnect, onReconnectFailed });
    const first = wsInstances[0];

    first.readyState = 3;
    first.onclose?.();
    await jest.advanceTimersByTimeAsync(500);

    client.stop();
    await jest.advanceTimersByTimeAsync(60000);
    expect(wsInstances).toHaveLength(1);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onReconnectFailed).not.toHaveBeenCalled();
  });

  it('start() during an outage awaits the ongoing reconnect instead of respawning', async () => {
    const { client, proc } = await startClient();
    const first = wsInstances[0];
    first.readyState = 3;
    first.onclose?.();

    await jest.advanceTimersByTimeAsync(1000);
    expect(wsInstances).toHaveLength(2);
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    // start() while the reconnect loop is sleeping/joining must not spawn.
    const restartPromise = client.start();
    autoAnswerInitialize(wsInstances[1]);
    wsInstances[1].onopen?.();
    wsInstances[1].readyState = 1;
    await jest.advanceTimersByTimeAsync(0);
    await expect(restartPromise).resolves.toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('falls back to a full respawn when the reconnect budget is exhausted and start() is called', async () => {
    const { client } = await startClient();
    const first = wsInstances[0];
    first.readyState = 3;
    first.onclose?.();

    for (let attempt = 1; attempt <= 5; attempt++) {
      await jest.advanceTimersByTimeAsync(1000 * 2 ** (attempt - 1));
      wsInstances[wsInstances.length - 1].onerror?.(new Error('refused'));
    }
    await flush();
    expect(mockSpawn).toHaveBeenCalledTimes(1);

    // After the budget is gone, start() performs a full restart.
    const secondProc = createMockProcess();
    mockSpawn.mockReturnValue(secondProc);
    const restartPromise = client.start();
    await flush();
    emitWsUrl(secondProc.stdout!);
    await flush();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const fresh = wsInstances[wsInstances.length - 1];
    autoAnswerInitialize(fresh);
    fresh.onopen?.();
    fresh.readyState = 1;
    await expect(restartPromise).resolves.toBeUndefined();

    fresh.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'thread/list') {
        simulateResponse(fresh, msg.id, { data: [{ id: 'respawned' }] });
      }
    });
    await expect(client.listThreads()).resolves.toEqual([{ id: 'respawned' }]);
  });

  it('keeps -32601 replies working on the reconnected socket', async () => {
    await startClient();
    const first = wsInstances[0];
    first.readyState = 3;
    first.onclose?.();

    await jest.advanceTimersByTimeAsync(1000);
    const second = wsInstances[1];
    autoAnswerInitialize(second);
    second.onopen?.();
    second.readyState = 1;
    await flush();

    // Unregistered v2 route on the new socket still gets a spec-compliant reply.
    second.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 77, method: 'item/tool/requestUserInput', params: {} }),
    });
    await flush();
    await flush();
    const lastSent = JSON.parse(second.send.mock.calls[second.send.mock.calls.length - 1][0] as string);
    expect(lastSent.error).toEqual({ code: -32601, message: expect.stringContaining('item/tool/requestUserInput') });
  });

  it('attaches code and data to JSON-RPC errors so callers can classify them', async () => {
    const { client } = await startClient();
    const first = wsInstances[0];
    first.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        simulateError(first, msg.id, {
          code: -32000,
          message: 'active turn is not steerable',
          data: { type: 'active_turn_not_steerable', turn_kind: 'review' },
        });
      }
    });

    const result = await client.steerTurn('t1', 'turn-1', [{ type: 'text', text: 'hi' }]);
    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      error: expect.objectContaining({ code: 'active_turn_not_steerable', turnKind: 'review' }),
    });
  });
});
