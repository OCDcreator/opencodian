/**
 * Real unit tests for CodexAppServerClient server-request dispatch bridge.
 *
 * Server-initiated JSON-RPC requests carry BOTH `method` and `id`. Before this
 * slice they were silently dropped by handleMessage()'s response branch. These
 * tests prove the three-way dispatch (response / notification / server request),
 * the handler registry, and the JSON-RPC reply path.
 *
 * Mocks node:child_process and ws at the module level so the real
 * CodexAppServerClient implementation is exercised.
 */

import type { spawn as SpawnFn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mocks (must be set up before importing the class under test)
// ---------------------------------------------------------------------------

const mockSpawn = jest.fn<ReturnType<typeof SpawnFn>, Parameters<typeof SpawnFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...args: Parameters<typeof SpawnFn>) => mockSpawn(...args),
}));

const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1, // WebSocket.OPEN
  onopen: null as ((event?: unknown) => void) | null,
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as ((event?: unknown) => void) | null,
  onclose: null as ((event?: unknown) => void) | null,
};

const MockWebSocket = jest.fn().mockImplementation(() => mockWsInstance);

jest.mock('ws', () => MockWebSocket);

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: (...args: string[]) => args.join('/'),
}));

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function emitWsUrl(proc: ReturnType<typeof SpawnFn>): void {
  setTimeout(() => {
    (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

function simulateResponse(id: number, result: unknown): void {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

async function createInitializedClient(): Promise<CodexAppServerClient> {
  const proc = createMockProcess();
  mockSpawn.mockReturnValue(proc);
  emitWsUrl(proc);

  setTimeout(() => mockWsInstance.onopen?.(), 10);

  const c = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

  mockWsInstance.send.mockImplementation((data: string) => {
    const msg = JSON.parse(data);
    if (msg.method === 'initialize') {
      setTimeout(() => simulateResponse(msg.id, {}), 5);
    }
  });

  await c.start();
  mockWsInstance.send.mockClear();
  return c;
}

/** Capture the last outbound JSON-RPC message sent on the WebSocket. */
function lastSentMessage(): Record<string, unknown> {
  const calls = mockWsInstance.send.mock.calls;
  const last = calls[calls.length - 1];
  return JSON.parse(last[0] as string) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexAppServerClient server-request dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.send.mockClear();
    mockWsInstance.close.mockClear();
    mockWsInstance.readyState = 1;
    mockWsInstance.onopen = null;
    mockWsInstance.onmessage = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onclose = null;
  });

  it('still resolves ordinary responses (id, no method) for pending client requests', async () => {
    const client = await createInitializedClient();

    // Issue a real client request and let the server reply with a plain response.
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'thread/list') {
        setTimeout(() => simulateResponse(msg.id, { data: [{ id: 't1' }] }), 5);
      }
    });

    const threads = await client.listThreads({ limit: 1 });

    expect(threads).toEqual([{ id: 't1' }]);
  });

  it('still dispatches notifications (method, no id) to notification handlers', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn();
    client.addNotificationHandler('some/notification', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'some/notification',
      params: { ok: true },
    }) });

    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it('routes a server request (method + id) to a registered handler instead of dropping it', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn().mockReturnValue({ decision: 'approved' });
    client.registerServerRequestHandler('execCommandApproval', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 9001,
      method: 'execCommandApproval',
      params: { command: ['ls', '-la'], cwd: '/tmp' },
    }) });

    // Handler is invoked asynchronously; wait one microtask tick.
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledWith({ command: ['ls', '-la'], cwd: '/tmp' });
  });

  it('sends a JSON-RPC result reply after the handler resolves', async () => {
    const client = await createInitializedClient();

    client.registerServerRequestHandler('applyPatchApproval', () => ({ decision: 'approved_for_session' }));

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 777,
      method: 'applyPatchApproval',
      params: { changes: [] },
    }) });

    await Promise.resolve();
    await Promise.resolve();

    expect(lastSentMessage()).toEqual({
      jsonrpc: '2.0',
      id: 777,
      result: { decision: 'approved_for_session' },
    });
  });

  it('supports async handlers and replies once the promise resolves', async () => {
    const client = await createInitializedClient();

    client.registerServerRequestHandler('execCommandApproval', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { decision: 'denied' };
    });

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 55,
      method: 'execCommandApproval',
      params: {},
    }) });

    // Not sent yet (handler still pending).
    expect(mockWsInstance.send).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 20));

    expect(lastSentMessage()).toEqual({
      jsonrpc: '2.0',
      id: 55,
      result: { decision: 'denied' },
    });
  });

  it('replies with JSON-RPC method-not-found error when no handler is registered', async () => {
    await createInitializedClient();

    // No handler registered for this method.
    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 404,
      method: 'mcpServer/elicitation/request',
      params: {},
    }) });

    await Promise.resolve();
    await Promise.resolve();

    const reply = lastSentMessage();
    expect(reply.id).toBe(404);
    expect(reply.error).toEqual({ code: -32601, message: expect.stringContaining('mcpServer/elicitation/request') });
    expect(reply.result).toBeUndefined();
  });

  it('replies with JSON-RPC internal-error when the handler throws', async () => {
    const client = await createInitializedClient();

    client.registerServerRequestHandler('execCommandApproval', () => {
      throw new Error('handler boom');
    });

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 11,
      method: 'execCommandApproval',
      params: {},
    }) });

    await Promise.resolve();
    await Promise.resolve();

    const reply = lastSentMessage();
    expect(reply.id).toBe(11);
    expect(reply.error).toEqual({ code: -32603, message: 'handler boom' });
    expect(reply.result).toBeUndefined();
  });

  it('replies with internal-error when an async handler rejects', async () => {
    const client = await createInitializedClient();

    client.registerServerRequestHandler('execCommandApproval', async () => {
      throw new Error('async boom');
    });

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 12,
      method: 'execCommandApproval',
      params: {},
    }) });

    await new Promise((r) => setTimeout(r, 10));

    const reply = lastSentMessage();
    expect(reply.id).toBe(12);
    expect(reply.error).toEqual({ code: -32603, message: 'async boom' });
  });

  it('stops dispatching to a handler after it is unregistered', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn().mockReturnValue({ decision: 'approved' });
    client.registerServerRequestHandler('execCommandApproval', handler);
    client.unregisterServerRequestHandler('execCommandApproval');

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'execCommandApproval',
      params: {},
    }) });

    await Promise.resolve();
    await Promise.resolve();

    expect(handler).not.toHaveBeenCalled();
    // Falls back to method-not-found reply.
    const reply = lastSentMessage();
    expect(reply.error).toEqual({ code: -32601, message: expect.any(String) });
  });
});
