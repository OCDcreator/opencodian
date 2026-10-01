/**
 * Real unit tests for CodexAppServerClient.steerTurn() (Codex 0.159.0
 * `turn/steer`) and the shared isAppServerMethodNotFoundError predicate.
 *
 * Mocks node:child_process and ws at the module level so the real
 * CodexAppServerClient implementation is exercised.
 */

import type { spawn as SpawnFn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn<ReturnType<typeof SpawnFn>, Parameters<typeof SpawnFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...args: Parameters<typeof SpawnFn>) => mockSpawn(...args),
}));

const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  onopen: null as ((event?: unknown) => void) | null,
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as ((event?: unknown) => void) | null,
  onclose: null as ((event?: unknown) => void) | null,
};

const MockWebSocket = jest.fn().mockImplementation(() => mockWsInstance);

jest.mock('ws', () => MockWebSocket);

import {
  CodexAppServerClient,
  isAppServerMethodNotFoundError,
} from '../../../../../src/core/agents/backend/CodexAppServerClient';

function emitWsUrl(proc: EventEmitter) {
  setTimeout(() => {
    proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

function simulateResponse(id: number, result: unknown) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function simulateError(id: number, error: { code: number; message: string; data?: unknown }) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error }) });
}

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function lastSentMessage(): Record<string, unknown> {
  const calls = mockWsInstance.send.mock.calls;
  const last = calls[calls.length - 1];
  return JSON.parse(last[0] as string) as Record<string, unknown>;
}

describe('CodexAppServerClient.steerTurn', () => {
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

  async function createClient(): Promise<CodexAppServerClient> {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });
    await client.start();
    mockWsInstance.send.mockClear();
    return client;
  }

  it('serializes turn/steer params with text input and clientUserMessageId', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateResponse(msg.id, { turnId: 'turn-9' }), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [
      { type: 'text', text: 'focus on the parser only', text_elements: [{ byteRange: { start: 0, end: 5 }, placeholder: 'file' }] },
    ], { clientUserMessageId: 'msg-1' });

    expect(result).toEqual({ ok: true, turnId: 'turn-9' });
    const sent = lastSentMessage();
    expect(sent.method).toBe('turn/steer');
    expect(sent.params).toEqual({
      threadId: 'thread-1',
      expectedTurnId: 'turn-8',
      input: [{ type: 'text', text: 'focus on the parser only', text_elements: [{ byteRange: { start: 0, end: 5 }, placeholder: 'file' }] }],
      clientUserMessageId: 'msg-1',
    });
  });

  it('omits clientUserMessageId when not provided', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateResponse(msg.id, { turnId: 'turn-9' }), 5);
      }
    });

    await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    const sent = lastSentMessage();
    expect('clientUserMessageId' in (sent.params as Record<string, unknown>)).toBe(false);
  });

  it('returns unavailable when the route is missing (-32601)', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateError(msg.id, { code: -32601, message: 'Method not found: turn/steer' }), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    expect(result).toEqual({
      ok: false,
      reason: 'unavailable',
      errorReason: expect.stringContaining('Method not found'),
    });
  });

  it('classifies a non-steerable review turn from the error message', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateError(msg.id, {
          code: -32000,
          message: 'turn is not steerable: non_steerable_review',
        }), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      error: expect.objectContaining({ code: 'non_steerable_review', turnKind: 'review' }),
    });
  });

  it('classifies active_turn_not_steerable with compact kind from error data', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateError(msg.id, {
          code: -32000,
          message: 'active turn is not steerable',
          data: { type: 'active_turn_not_steerable', turn_kind: 'compact' },
        }), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      error: expect.objectContaining({ code: 'active_turn_not_steerable', turnKind: 'compact' }),
    });
  });

  it('surfaces a misalignment rejection payload', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateError(msg.id, {
          code: -32000,
          message: 'misalignment',
          data: { message: 'steer rejected by misalignment monitoring' },
        }), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      error: expect.objectContaining({
        misalignment: { message: 'steer rejected by misalignment monitoring' },
      }),
    });
  });

  it('treats a turnId-less success response as a rejected unknown error', async () => {
    const client = await createClient();
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'turn/steer') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });

    const result = await client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);

    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      error: expect.objectContaining({ code: 'unknown' }),
    });
  });

  it('returns unavailable when the app-server process fails to start', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });
    const startPromise = client.steerTurn('thread-1', 'turn-8', [{ type: 'text', text: 'hello' }]);
    // Let start() reach waitForWsUrl, then fail the spawn.
    await new Promise((resolve) => setTimeout(resolve, 20));
    proc.emit('error', new Error('spawn codex ENOENT'));

    await expect(startPromise).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
      errorReason: expect.stringContaining('ENOENT'),
    });
    client.stop();
  });
});

describe('isAppServerMethodNotFoundError', () => {
  it('matches -32601 via the attached error code', () => {
    const err = new Error('JSON-RPC error -32601: Method not found: turn/steer') as Error & { code?: number };
    err.code = -32601;
    expect(isAppServerMethodNotFoundError(err)).toBe(true);
  });

  it('matches method-not-found messages without a code', () => {
    expect(isAppServerMethodNotFoundError(new Error('JSON-RPC error -32601: Method not found: foo'))).toBe(true);
    expect(isAppServerMethodNotFoundError(new Error('unknown method'))).toBe(true);
    expect(isAppServerMethodNotFoundError(new Error('route not supported'))).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isAppServerMethodNotFoundError(new Error('chatgpt authentication required'))).toBe(false);
    expect(isAppServerMethodNotFoundError(new Error('thread not found'))).toBe(false);
    expect(isAppServerMethodNotFoundError(null)).toBe(false);
  });
});
