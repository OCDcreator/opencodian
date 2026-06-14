/**
 * Real unit tests for CodexAppServerClient.listModels().
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

// WebSocket mock — captures sent messages and lets tests inject responses.
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

// ---------------------------------------------------------------------------
// Import class under test (AFTER mocks are established)
// ---------------------------------------------------------------------------

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Simulate the app-server process emitting the ws:// URL on stdout. */
function emitWsUrl(proc: EventEmitter) {
  setTimeout(() => {
    proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

/** Simulate a JSON-RPC response arriving from the server. */
function simulateResponse(id: number, result: unknown) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  mockWsInstance.onmessage?.({ data: response });
}

/** Simulate a JSON-RPC error response arriving from the server. */
function simulateError(id: number, error: { code: number; message: string }) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error });
  mockWsInstance.onmessage?.({ data: response });
}

/** Create a mock child process with stdout/stderr EventEmitters. */
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

describe('CodexAppServerClient.listModels', () => {
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

  it('returns models from app-server response', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'model/list') {
        setTimeout(() => {
          simulateResponse(msg.id, {
            data: [
              {
                id: 'gpt-5.5',
                model: 'gpt-5.5',
                displayName: 'GPT-5.5',
                description: 'Frontier model.',
                defaultReasoningEffort: 'medium',
              },
              {
                id: 'gpt-5.4',
                model: 'gpt-5.4',
                displayName: 'gpt-5.4',
                description: null,
                defaultReasoningEffort: 'medium',
              },
            ],
          });
        }, 5);
      }
    });

    const models = await client.listModels();

    expect(models).toEqual([
      {
        id: 'gpt-5.5',
        model: 'gpt-5.5',
        displayName: 'GPT-5.5',
        description: 'Frontier model.',
        defaultReasoningEffort: 'medium',
      },
      {
        id: 'gpt-5.4',
        model: 'gpt-5.4',
        displayName: 'gpt-5.4',
        description: null,
        defaultReasoningEffort: 'medium',
      },
    ]);
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
      } else if (msg.method === 'model/list') {
        setTimeout(() => {
          simulateError(msg.id, { code: -32600, message: 'Invalid request' });
        }, 5);
      }
    });

    const models = await client.listModels();

    expect(models).toEqual([]);
  });

  it('passes limit and cursor options to the request', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    let capturedParams: Record<string, unknown> | null = null;
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'model/list') {
        capturedParams = msg.params;
        setTimeout(() => {
          simulateResponse(msg.id, { data: [] });
        }, 5);
      }
    });

    await client.listModels({ limit: 10, cursor: 'abc123' });

    expect(capturedParams).toMatchObject({ limit: 10, cursor: 'abc123' });
  });

  it('uses default limit of 50 when no limit provided', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);

    setTimeout(() => mockWsInstance.onopen?.(), 10);

    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

    let capturedParams: Record<string, unknown> | null = null;
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'model/list') {
        capturedParams = msg.params;
        setTimeout(() => {
          simulateResponse(msg.id, { data: [] });
        }, 5);
      }
    });

    await client.listModels();

    expect(capturedParams).toMatchObject({ limit: 50 });
  });
});
