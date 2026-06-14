/**
 * Unit tests for CodexAppServerClient thread goal methods.
 *
 * getThreadGoal / setThreadGoal / clearThreadGoal
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

const SAMPLE_GOAL = {
  threadId: 'test-thread-1',
  objective: 'Build a feature',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 5000,
  timeUsedSeconds: 120,
  createdAt: 1781277321,
  updatedAt: 1781277321,
};

describe('CodexAppServerClient thread goal methods', () => {
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

  describe('getThreadGoal', () => {
    it('returns goal from app-server response', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/goal/get') {
          setTimeout(() => {
            simulateResponse(msg.id, { goal: SAMPLE_GOAL });
          }, 5);
        }
      });

      const goal = await client.getThreadGoal('test-thread-1');

      expect(goal).toEqual(SAMPLE_GOAL);
    });

    it('returns null when goal is null', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/goal/get') {
          setTimeout(() => {
            simulateResponse(msg.id, { goal: null });
          }, 5);
        }
      });

      const goal = await client.getThreadGoal('nonexistent');

      expect(goal).toBeNull();
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
        } else if (msg.method === 'thread/goal/get') {
          setTimeout(() => {
            simulateError(msg.id, { code: -32600, message: 'Invalid request' });
          }, 5);
        }
      });

      const goal = await client.getThreadGoal('bad');

      expect(goal).toBeNull();
    });
  });

  describe('setThreadGoal', () => {
    it('sets objective and returns goal', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      const updatedGoal = { ...SAMPLE_GOAL, objective: 'New objective', tokensUsed: 0, timeUsedSeconds: 0 };
      let capturedParams: Record<string, unknown> | null = null;

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/goal/set') {
          capturedParams = msg.params;
          setTimeout(() => {
            simulateResponse(msg.id, { goal: updatedGoal });
          }, 5);
        }
      });

      const result = await client.setThreadGoal('test-thread-1', 'New objective');

      expect(result).toEqual(updatedGoal);
      expect(capturedParams).not.toBeNull();
      expect(capturedParams!.objective).toBe('New objective');
      expect(capturedParams!.threadId).toBe('test-thread-1');
    });

    it('passes tokenBudget when provided', async () => {
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
        } else if (msg.method === 'thread/goal/set') {
          capturedParams = msg.params;
          setTimeout(() => {
            simulateResponse(msg.id, { goal: { ...SAMPLE_GOAL, tokenBudget: 100000 } });
          }, 5);
        }
      });

      await client.setThreadGoal('test-thread-1', 'Budgeted task', { tokenBudget: 100000 });

      expect(capturedParams).not.toBeNull();
      expect(capturedParams!.tokenBudget).toBe(100000);
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
        } else if (msg.method === 'thread/goal/set') {
          setTimeout(() => {
            simulateError(msg.id, { code: -32600, message: 'Invalid request' });
          }, 5);
        }
      });

      const result = await client.setThreadGoal('bad', 'test');

      expect(result).toBeNull();
    });
  });

  describe('clearThreadGoal', () => {
    it('returns true when cleared', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);
      emitWsUrl(proc.stdout!);
      setTimeout(() => mockWsInstance.onopen?.(), 10);

      const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'initialize') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        } else if (msg.method === 'thread/goal/clear') {
          setTimeout(() => {
            simulateResponse(msg.id, { cleared: true });
          }, 5);
        }
      });

      const result = await client.clearThreadGoal('test-thread-1');

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
        } else if (msg.method === 'thread/goal/clear') {
          setTimeout(() => {
            simulateError(msg.id, { code: -32600, message: 'Invalid request' });
          }, 5);
        }
      });

      const result = await client.clearThreadGoal('bad');

      expect(result).toBe(false);
    });
  });
});
