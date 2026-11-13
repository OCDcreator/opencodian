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

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: (...args: string[]) => args.join('/'),
}));

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/codex/CodexAppServerClient';

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
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  mockWsInstance.onmessage?.({ data: response });
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

describe('CodexAppServerClient notification handlers', () => {
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

  it('invokes notification handler for matching method', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn();
    client.addNotificationHandler('mcpServer/oauthLogin/completed', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'mcpServer/oauthLogin/completed',
      params: { name: 'test-server' },
    }) });

    expect(handler).toHaveBeenCalledWith({ name: 'test-server' });
  });

  it('does not invoke removed handler', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn();
    client.addNotificationHandler('mcpServer/oauthLogin/completed', handler);
    client.removeNotificationHandler('mcpServer/oauthLogin/completed', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'mcpServer/oauthLogin/completed',
      params: { name: 'test-server' },
    }) });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple handlers for same method', async () => {
    const client = await createInitializedClient();

    const handler1 = jest.fn();
    const handler2 = jest.fn();
    client.addNotificationHandler('test/method', handler1);
    client.addNotificationHandler('test/method', handler2);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'test/method',
      params: { key: 'value' },
    }) });

    expect(handler1).toHaveBeenCalledWith({ key: 'value' });
    expect(handler2).toHaveBeenCalledWith({ key: 'value' });
  });

  it('continues after handler throws', async () => {
    const client = await createInitializedClient();

    const badHandler = jest.fn(() => { throw new Error('bad'); });
    const goodHandler = jest.fn();
    client.addNotificationHandler('test/method', badHandler);
    client.addNotificationHandler('test/method', goodHandler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'test/method',
      params: {},
    }) });

    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
  });

  it('ignores notifications without matching handler', async () => {
    const client = await createInitializedClient();

    const handler = jest.fn();
    client.addNotificationHandler('test/method', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'other/method',
      params: {},
    }) });

    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribes only to notifications for its requested thread and disposes cleanly', async () => {
    const client = await createInitializedClient();
    const handler = jest.fn();
    const subscription = client.subscribeToThreadNotifications('thread-1', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'other-thread', tokenUsage: {} },
    }) });
    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'thread-1', tokenUsage: { total: { totalTokens: 42 } } },
    }) });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      method: 'thread/tokenUsage/updated',
      params: { threadId: 'thread-1', tokenUsage: { total: { totalTokens: 42 } } },
    });

    subscription.dispose();
    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1' } },
    }) });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('CodexAppServerClient.subscribeToThreadNotifications — 0.169.0 methods + isolation', () => {
  it('delivers real summary/turn-diff wire frames to the owning thread handler only', async () => {
    const client = await createInitializedClient();
    const eventsA: Array<{ method: string; params: unknown }> = [];
    const eventsB: Array<{ method: string; params: unknown }> = [];
    client.subscribeToThreadNotifications('thread-A', (event) => eventsA.push(event));
    client.subscribeToThreadNotifications('thread-B', (event) => eventsB.push(event));

    const frames: Array<{ method: string; params: Record<string, unknown> }> = [
      { method: 'item/reasoning/summaryTextDelta', params: { threadId: 'thread-A', turnId: 'turn-A', itemId: 'rs-1', delta: 'step one', summaryIndex: 0 } },
      { method: 'item/reasoning/summaryPartAdded', params: { threadId: 'thread-A', turnId: 'turn-A', itemId: 'rs-1', summaryIndex: 1 } },
      { method: 'turn/diff/updated', params: { threadId: 'thread-B', turnId: 'turn-B', diff: '--- a\n+++ b\n' } },
    ];
    for (const frame of frames) {
      mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: frame.method, params: frame.params }) });
    }

    expect(eventsA.map((event) => event.method)).toEqual(['item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded']);
    expect(eventsB.map((event) => event.method)).toEqual(['turn/diff/updated']);
    expect((eventsA[0].params as { delta?: string }).delta).toBe('step one');
  });

  it('never subscribes the deprecated-and-v2-unsent thread/compacted notification', async () => {
    const client = await createInitializedClient();
    const handler = jest.fn();
    client.subscribeToThreadNotifications('thread-A', handler);

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'thread/compacted',
      params: { threadId: 'thread-A', turnId: 'turn-A' },
    }) });

    expect(handler).not.toHaveBeenCalled();
    expect(mockWsInstance.onmessage).toBeDefined();
  });

  it('stops delivering after dispose so concurrent sessions do not leak events', async () => {
    const client = await createInitializedClient();
    const handler = jest.fn();
    const subscription = client.subscribeToThreadNotifications('thread-A', handler);
    subscription.dispose();

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: 'thread-A', turnId: 'turn-A', itemId: 'rs-1', delta: 'late', summaryIndex: 0 },
    }) });

    expect(handler).not.toHaveBeenCalled();
  });
});
