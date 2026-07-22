/**
 * Unit tests for CodexAppServerClient thread lifecycle methods.
 *
 * forkThread / archiveThread / unarchiveThread
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

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

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

const SAMPLE_THREAD = {
  id: 'forked-thread-1',
  sessionId: 'forked-thread-1',
  preview: 'Forked preview',
  name: 'Forked session',
  createdAt: 1781346265,
  updatedAt: 1781346265,
};

function resetAppServerMocks(): void {
  jest.clearAllMocks();
  mockWsInstance.send.mockClear();
  mockWsInstance.close.mockClear();
  mockWsInstance.readyState = 1;
  mockWsInstance.onopen = null;
  mockWsInstance.onmessage = null;
  mockWsInstance.onerror = null;
  mockWsInstance.onclose = null;
}

describe('CodexAppServerClient thread lifecycle methods', () => {
  beforeEach(resetAppServerMocks);

  describe('listThreads', () => {
    it('passes archived=true to thread/list when requested', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/list') {
          setTimeout(() => simulateResponse(msg.id, { data: [{ ...SAMPLE_THREAD, archived: msg.params.archived }] }), 5);
        }
      });

      const result = await client.listThreads({ limit: 50, archived: true });

      expect(result).toHaveLength(1);
      expect(result[0].archived).toBe(true);
    });

    it('passes archived=false to thread/list when requested', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/list') {
          setTimeout(() => simulateResponse(msg.id, { data: [{ ...SAMPLE_THREAD, archived: msg.params.archived }] }), 5);
        }
      });

      const result = await client.listThreads({ limit: 50, archived: false });

      expect(result).toHaveLength(1);
      expect(result[0].archived).toBe(false);
    });
  });

  it('negotiates experimental API and exposes thread/turn chat lifecycle wrappers', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc.stdout!);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data) as { id?: number; method?: string; params?: Record<string, unknown> };
      if (!msg.method) return;
      requests.push({ method: msg.method, params: msg.params ?? {} });
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id!, {}), 5);
      } else if (msg.method === 'thread/start') {
        setTimeout(() => simulateResponse(msg.id!, { thread: { ...SAMPLE_THREAD, id: 'thread-new' } }), 5);
      } else if (msg.method === 'thread/resume') {
        setTimeout(() => simulateResponse(msg.id!, { thread: { ...SAMPLE_THREAD, id: 'thread-existing' } }), 5);
      } else if (msg.method === 'turn/start') {
        setTimeout(() => simulateResponse(msg.id!, { turn: { id: 'turn-1', items: [] } }), 5);
      } else if (msg.method === 'turn/interrupt') {
        setTimeout(() => simulateResponse(msg.id!, {}), 5);
      }
    });

    await expect(client.startThread({ model: 'gpt-5', cwd: '/vault' })).resolves.toMatchObject({ id: 'thread-new' });
    await expect(client.resumeThread('thread-existing', { sandbox: 'workspace-write' })).resolves.toMatchObject({ id: 'thread-existing' });
    await expect(client.startTurn({
      threadId: 'thread-existing',
      input: [{ type: 'text', text: 'hello', text_elements: [] }],
    })).resolves.toMatchObject({ id: 'turn-1' });
    await expect(client.interruptTurn('thread-existing', 'turn-1')).resolves.toBe(true);

    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'initialize',
        params: expect.objectContaining({
          capabilities: { experimentalApi: true, requestAttestation: false },
        }),
      }),
      { method: 'thread/start', params: { model: 'gpt-5', cwd: '/vault' } },
      { method: 'thread/resume', params: { threadId: 'thread-existing', sandbox: 'workspace-write' } },
      expect.objectContaining({
        method: 'turn/start',
        params: expect.objectContaining({ threadId: 'thread-existing' }),
      }),
      { method: 'turn/interrupt', params: { threadId: 'thread-existing', turnId: 'turn-1' } },
    ]));
  });
});

describe('CodexAppServerClient persisted thread actions', () => {
  beforeEach(resetAppServerMocks);

  describe('forkThread', () => {
    it('returns the forked thread from app-server response', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/fork') {
          setTimeout(() => simulateResponse(msg.id, { thread: SAMPLE_THREAD }), 5);
        }
      });

      const result = await client.forkThread('source-thread-1');

      expect(result).toEqual({ thread: SAMPLE_THREAD });
    });

    it('returns null on error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/fork') {
          setTimeout(() => simulateError(msg.id, { code: -32600, message: 'Invalid request' }), 5);
        }
      });

      const result = await client.forkThread('bad');

      expect(result).toBeNull();
    });
  });

  describe('archiveThread', () => {
    it('returns true on success', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/archive') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });

      const result = await client.archiveThread('thread-1');

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/archive') {
          setTimeout(() => simulateError(msg.id, { code: -32600, message: 'Invalid request' }), 5);
        }
      });

      const result = await client.archiveThread('bad');

      expect(result).toBe(false);
    });
  });

  describe('unarchiveThread', () => {
    it('returns true on success', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/unarchive') {
          setTimeout(() => simulateResponse(msg.id, { thread: { ...SAMPLE_THREAD, archived: false } }), 5);
        }
      });

      const result = await client.unarchiveThread('thread-1');

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/unarchive') {
          setTimeout(() => simulateError(msg.id, { code: -32600, message: 'Invalid request' }), 5);
        }
      });

      const result = await client.unarchiveThread('bad');

      expect(result).toBe(false);
    });
  });
});
