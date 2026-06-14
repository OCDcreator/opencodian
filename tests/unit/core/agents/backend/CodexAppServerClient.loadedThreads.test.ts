/**
 * Real unit tests for CodexAppServerClient.listLoadedThreads().
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
  readyState: 1,
  onopen: null as ((event?: unknown) => void) | null,
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as ((event?: unknown) => void) | null,
  onclose: null as ((event?: unknown) => void) | null,
};

const MockWebSocket = jest.fn().mockImplementation(() => mockWsInstance);

jest.mock('ws', () => MockWebSocket);

// ---------------------------------------------------------------------------
// Import class under test (AFTER mocks are established)
// ---------------------------------------------------------------------------

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function emitWsUrl(proc: EventEmitter) {
  setTimeout(() => {
    proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

function simulateResponse(id: number, result: unknown) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  mockWsInstance.onmessage?.({ data: response });
}

function simulateError(id: number, error: { code: number; message: string }) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error });
  mockWsInstance.onmessage?.({ data: response });
}

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexAppServerClient.listLoadedThreads', () => {
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

  it('returns loaded thread IDs from app-server response', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'thread/loaded/list') {
        setTimeout(() => {
          simulateResponse(msg.id, {
            data: [
              { id: 'thread-1' },
              { id: 'thread-2' },
            ],
            nextCursor: null,
          });
        }, 5);
      }
    });

    const threads = await client.listLoadedThreads();

    expect(threads).toEqual([
      { id: 'thread-1' },
      { id: 'thread-2' },
    ]);
  });

  it('returns empty array when no threads are loaded', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'thread/loaded/list') {
        setTimeout(() => {
          simulateResponse(msg.id, { data: [], nextCursor: null });
        }, 5);
      }
    });

    const threads = await client.listLoadedThreads();

    expect(threads).toEqual([]);
  });

  it('returns empty array on error', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'thread/loaded/list') {
        setTimeout(() => {
          simulateError(msg.id, { code: -32600, message: 'Invalid request' });
        }, 5);
      }
    });

    const threads = await client.listLoadedThreads();

    expect(threads).toEqual([]);
  });

  it('returns empty array when result is undefined', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'thread/loaded/list') {
        setTimeout(() => {
          simulateResponse(msg.id, null);
        }, 5);
      }
    });

    const threads = await client.listLoadedThreads();

    expect(threads).toEqual([]);
  });
});
