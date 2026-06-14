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

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

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
});
