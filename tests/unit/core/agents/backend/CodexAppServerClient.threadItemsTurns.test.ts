/**
 * Real unit tests for the Codex 0.159.0 client routes:
 * thread/items/list, thread/turns/list, thread/name/set, thread/delete,
 * and thread/attachment/add|list|remove.
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

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function emitWsUrl(proc: EventEmitter) {
  setTimeout(() => {
    proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

function simulateResponse(id: number, result: unknown) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function simulateError(id: number, error: { code: number; message: string }) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error }) });
}

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function sentMessages(): Array<Record<string, unknown>> {
  return mockWsInstance.send.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);
}

function lastSentMessage(): Record<string, unknown> {
  const calls = sentMessages();
  return calls[calls.length - 1];
}


function resetMocks(): void {
  jest.clearAllMocks();
  mockWsInstance.send.mockClear();
  mockWsInstance.close.mockClear();
  mockWsInstance.readyState = 1;
  mockWsInstance.onopen = null;
  mockWsInstance.onmessage = null;
  mockWsInstance.onerror = null;
  mockWsInstance.onclose = null;
}

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

describe('CodexAppServerClient 0.159.0 thread items/turns pages', () => {
  beforeEach(resetMocks);

  describe('listThreadItems', () => {
    it('serializes turn filter, item-anchor cursor, limit, and sort direction', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/items/list') {
          setTimeout(() => simulateResponse(msg.id, {
            data: [{ item: { type: 'userMessage', id: 'i1', content: [] }, turnId: 'turn-1' }],
            nextCursor: 'next-1',
            backwardsCursor: 'back-1',
          }), 5);
        }
      });

      const page = await client.listThreadItems('thread-1', {
        turnId: 'turn-1',
        cursor: { type: 'item', itemId: 'i0' },
        limit: 25,
        sortDirection: 'desc',
      });

      expect(page).toEqual({
        data: [{ item: { type: 'userMessage', id: 'i1', content: [] }, turnId: 'turn-1' }],
        nextCursor: 'next-1',
        backwardsCursor: 'back-1',
      });
      expect(lastSentMessage().params).toEqual({
        threadId: 'thread-1',
        turnId: 'turn-1',
        cursor: { type: 'item', itemId: 'i0' },
        limit: 25,
        sortDirection: 'desc',
      });
    });

    it('sends only threadId when no options are given', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/items/list') {
          setTimeout(() => simulateResponse(msg.id, { data: [] }), 5);
        }
      });

      await client.listThreadItems('thread-1');

      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1' });
    });

    it('defaults missing cursors to null and returns null on route failure', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/items/list') {
          setTimeout(() => simulateResponse(msg.id, { data: [] }), 5);
        }
      });

      const page = await client.listThreadItems('thread-1');
      expect(page).toEqual({ data: [], nextCursor: null, backwardsCursor: null });

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/items/list') {
          setTimeout(() => simulateError(msg.id, { code: -32601, message: 'Method not found: thread/items/list' }), 5);
        }
      });
      await expect(client.listThreadItems('thread-1')).resolves.toBeNull();
    });
  });

  describe('listThreadTurns', () => {
    it('serializes cursor/limit/sortDirection/itemsView and parses the page', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/turns/list') {
          setTimeout(() => simulateResponse(msg.id, {
            data: [{ id: 'turn-2', status: 'completed', items: [] }],
            nextCursor: 'cursor-2',
          }), 5);
        }
      });

      const page = await client.listThreadTurns('thread-1', {
        cursor: 'cursor-1',
        limit: 10,
        sortDirection: 'asc',
        itemsView: 'summary',
      });

      expect(page).toEqual({
        data: [{ id: 'turn-2', status: 'completed', items: [] }],
        nextCursor: 'cursor-2',
        backwardsCursor: null,
      });
      expect(lastSentMessage().params).toEqual({
        threadId: 'thread-1',
        cursor: 'cursor-1',
        limit: 10,
        sortDirection: 'asc',
        itemsView: 'summary',
      });
    });

    it('returns null when the response is not a page', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/turns/list') {
          setTimeout(() => simulateResponse(msg.id, { turns: [] }), 5);
        }
      });

      await expect(client.listThreadTurns('thread-1')).resolves.toBeNull();
    });
  });

});

describe('CodexAppServerClient 0.159.0 thread lifecycle routes', () => {
  beforeEach(resetMocks);

  describe('setThreadName', () => {
    it('sends thread/name/set and returns true on success', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/name/set') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });

      await expect(client.setThreadName('thread-1', 'New name')).resolves.toBe(true);
      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1', name: 'New name' });
    });

    it('returns false on route failure', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/name/set') {
          setTimeout(() => simulateError(msg.id, { code: -32601, message: 'Method not found: thread/name/set' }), 5);
        }
      });

      await expect(client.setThreadName('thread-1', 'New name')).resolves.toBe(false);
    });
  });

  describe('deleteThread', () => {
    it('sends thread/delete and returns true on success', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/delete') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });

      await expect(client.deleteThread('thread-1')).resolves.toBe(true);
      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1' });
    });

    it('returns false on failure', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/delete') {
          setTimeout(() => simulateError(msg.id, { code: -32000, message: 'thread not found' }), 5);
        }
      });

      await expect(client.deleteThread('missing')).resolves.toBe(false);
    });
  });

  describe('thread attachments', () => {
    it('addThreadAttachment parses { attachment, outcome }', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/attachment/add') {
          setTimeout(() => simulateResponse(msg.id, {
            attachment: { id: 'att-1', attachmentType: 'memory', identityKey: 'k1', payload: { text: 'x' }, createdAt: 42 },
            outcome: 'created',
          }), 5);
        }
      });

      const result = await client.addThreadAttachment('thread-1', 'memory', 'k1', { text: 'x' });

      expect(result).toEqual({
        attachment: { id: 'att-1', attachmentType: 'memory', identityKey: 'k1', payload: { text: 'x' }, createdAt: 42 },
        outcome: 'created',
      });
      expect(lastSentMessage().params).toEqual({
        threadId: 'thread-1', attachmentType: 'memory', identityKey: 'k1', payload: { text: 'x' },
      });
    });

    it('addThreadAttachment returns null on malformed responses', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/attachment/add') {
          setTimeout(() => simulateResponse(msg.id, { outcome: 'created' }), 5);
        }
      });

      await expect(client.addThreadAttachment('thread-1', 'memory', 'k1', {})).resolves.toBeNull();
    });

    it('listThreadAttachments parses the page and defaults nextCursor', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/attachment/list') {
          setTimeout(() => simulateResponse(msg.id, {
            data: [{ id: 'att-1', attachmentType: 'memory', identityKey: 'k1', payload: null, createdAt: 1 }],
          }), 5);
        }
      });

      const page = await client.listThreadAttachments('thread-1', { limit: 5 });

      expect(page).toEqual({
        data: [{ id: 'att-1', attachmentType: 'memory', identityKey: 'k1', payload: null, createdAt: 1 }],
        nextCursor: null,
      });
      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1', limit: 5 });
    });

    it('removeThreadAttachment sends identity and returns true', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'thread/attachment/remove') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });

      await expect(client.removeThreadAttachment('thread-1', 'memory', 'k1')).resolves.toBe(true);
      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1', attachmentType: 'memory', identityKey: 'k1' });
    });
  });

  it('keeps thread-scoped notification subscriptions working for new methods', async () => {
    const client = await createClient();
    const received: string[] = [];
    client.subscribeToThreadNotifications('thread-1', (event) => received.push(event.method));

    for (const method of [
      'thread/name/updated',
      'thread/goal/updated',
      'thread/goal/cleared',
      'thread/deleted',
      'thread/attachment/updated',
    ]) {
      mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method, params: { threadId: 'thread-1' } }) });
    }
    // Other-thread events stay isolated.
    mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'thread/deleted', params: { threadId: 'thread-2' } }) });

    expect(received).toEqual([
      'thread/name/updated',
      'thread/goal/updated',
      'thread/goal/cleared',
      'thread/deleted',
      'thread/attachment/updated',
    ]);
    expect(sentMessages()).toEqual([]);
  });
});
