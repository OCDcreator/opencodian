import type { spawn as SpawnFn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn<ReturnType<typeof SpawnFn>, Parameters<typeof SpawnFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...args: Parameters<typeof SpawnFn>) => mockSpawn(...args),
}));

const mockWsInstance = {
  send: jest.fn(), close: jest.fn(), readyState: 1,
  onopen: null as ((event?: unknown) => void) | null,
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as ((event?: unknown) => void) | null,
  onclose: null as ((event?: unknown) => void) | null,
};
jest.mock('ws', () => jest.fn().mockImplementation(() => mockWsInstance));

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function createProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function reply(id: number, result: unknown): void {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function reject(id: number, message: string): void {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32600, message } }) });
}

describe('CodexAppServerClient thread compaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.readyState = 1;
    mockWsInstance.onopen = null;
    mockWsInstance.onmessage = null;
  });

  async function clientWith(onCompact: (id: number, params: unknown) => void): Promise<CodexAppServerClient> {
    const proc = createProcess();
    mockSpawn.mockReturnValue(proc);
    setTimeout(() => (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n')), 0);
    setTimeout(() => mockWsInstance.onopen?.(), 0);
    mockWsInstance.send.mockImplementation((wire: string) => {
      const message = JSON.parse(wire) as { id: number; method: string; params?: unknown };
      if (message.method === 'initialize') setTimeout(() => reply(message.id, {}), 0);
      if (message.method === 'thread/compact/start') onCompact(message.id, message.params);
    });
    const client = new CodexAppServerClient({ codexPathOverride: '/test/codex' });
    await client.start();
    mockWsInstance.send.mockClear();
    return client;
  }

  it('sends the exact threadId and treats the empty ACK as accepted, not runtime completion', async () => {
    const client = await clientWith((id) => setTimeout(() => reply(id, {}), 0));

    await expect(client.startThreadCompaction('thread-real')).resolves.toEqual({
      status: 'accepted', acknowledged: true,
    });
    const sent = JSON.parse(mockWsInstance.send.mock.calls[0][0]) as { method: string; params: unknown };
    expect(sent).toMatchObject({ method: 'thread/compact/start', params: { threadId: 'thread-real' } });
    expect(sent.params).toEqual({ threadId: 'thread-real' });
  });

  it.each([
    ['nonempty ACK', (id: number) => reply(id, { accepted: true }), 'malformed'],
    ['bad thread route rejection', (id: number) => reject(id, 'thread not found'), 'invalid-thread'],
    ['route rejection', (id: number) => reject(id, 'Method not found: thread/compact/start'), 'unavailable'],
    ['unsupported route', (id: number) => reject(id, 'route not supported'), 'unavailable'],
  ])('classifies %s without fabricating acceptance', async (_name, respond, expectedStatus) => {
    const client = await clientWith((id) => setTimeout(() => respond(id), 0));
    await expect(client.startThreadCompaction('thread-real')).resolves.toMatchObject({
      status: expectedStatus, acknowledged: false,
    });
  });

  it('bounds an unanswered ACK without treating it as accepted', async () => {
    const client = await clientWith(() => { /* intentionally no reply */ });
    await expect(client.startThreadCompaction('thread-real', { acknowledgementTimeoutMs: 5 })).resolves.toMatchObject({
      status: 'timed-out', acknowledged: false,
    });
  });

  it('keeps an existing chat subscription when an independent compaction subscription is disposed', async () => {
    const client = await clientWith(() => { /* no RPC in this subscription test */ });
    const chatHandler = jest.fn();
    const compactionHandler = jest.fn();
    client.subscribeToThreadNotifications('thread-real', chatHandler);
    const compactionSubscription = client.subscribeToThreadNotifications('thread-real', compactionHandler);

    compactionSubscription.dispose();
    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0', method: 'thread/tokenUsage/updated',
      params: { threadId: 'thread-real', tokenUsage: { total: { totalTokens: 1 } } },
    }) });

    expect(chatHandler).toHaveBeenCalledTimes(1);
    expect(compactionHandler).not.toHaveBeenCalled();
  });
});
