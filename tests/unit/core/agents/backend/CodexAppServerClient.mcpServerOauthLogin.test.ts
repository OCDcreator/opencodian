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

describe('CodexAppServerClient mcpServerOauthLogin cleanup', () => {
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

  it('removes notification handler after successful OAuth login', async () => {
    const client = await createInitializedClient();
    const addSpy = jest.spyOn(client, 'addNotificationHandler');
    const removeSpy = jest.spyOn(client, 'removeNotificationHandler');

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'mcpServer/oauth/login') {
        setTimeout(() => simulateResponse(msg.id, { authorizationUrl: 'https://example.com/oauth' }), 5);
      }
    });

    const promise = client.mcpServerOauthLogin('test-server', { timeoutSecs: 1 });

    // Allow the request to be sent and responded to.
    await new Promise((resolve) => { setTimeout(resolve, 30); });

    mockWsInstance.onmessage?.({ data: JSON.stringify({
      jsonrpc: '2.0',
      method: 'mcpServer/oauthLogin/completed',
      params: { name: 'test-server' },
    }) });

    const result = await promise;

    expect(result.outcome).toBe('completed');
    expect(result.browserOpened).toBe(true);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('mcpServer/oauthLogin/completed', addSpy.mock.calls[0][1]);
  });

  it('fires onAuthorizationUrl callback when the response contains authorizationUrl', async () => {
    const client = await createInitializedClient();
    const onAuthorizationUrl = jest.fn();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'mcpServer/oauth/login') {
        setTimeout(() => simulateResponse(msg.id, { authorizationUrl: 'https://mcp.notion.com/authorize?code=abc' }), 5);
      }
    });

    const promise = client.mcpServerOauthLogin('notion-test', { timeoutSecs: 0.001, onAuthorizationUrl });

    const result = await promise;

    expect(result.outcome).toBe('pending');
    expect(result.browserOpened).toBe(true);
    expect(onAuthorizationUrl).toHaveBeenCalledTimes(1);
    expect(onAuthorizationUrl).toHaveBeenCalledWith('https://mcp.notion.com/authorize?code=abc');
  }, 10000);

  it('does not fire onAuthorizationUrl when response lacks authorizationUrl', async () => {
    const client = await createInitializedClient();
    const onAuthorizationUrl = jest.fn();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'mcpServer/oauth/login') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });

    const promise = client.mcpServerOauthLogin('test-server', { timeoutSecs: 0.001, onAuthorizationUrl });

    const result = await promise;

    expect(result.outcome).toBe('failed');
    expect(result.browserOpened).toBe(false);
    expect(onAuthorizationUrl).not.toHaveBeenCalled();
  }, 10000);

  it('removes notification handler after OAuth timeout', async () => {
    const client = await createInitializedClient();
    const addSpy = jest.spyOn(client, 'addNotificationHandler');
    const removeSpy = jest.spyOn(client, 'removeNotificationHandler');

    // Do not respond to mcpServer/oauth/login; let the race timeout expire.
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });

    const promise = client.mcpServerOauthLogin('test-server', { timeoutSecs: 0.001 });

    const result = await promise;

    expect(result.outcome).toBe('failed');
    expect(result.browserOpened).toBe(false);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  }, 10000);

  it('removes notification handler when request fails', async () => {
    const client = await createInitializedClient();
    const addSpy = jest.spyOn(client, 'addNotificationHandler');
    const removeSpy = jest.spyOn(client, 'removeNotificationHandler');

    mockWsInstance.readyState = 0;

    const result = await client.mcpServerOauthLogin('test-server', { timeoutSecs: 1 });

    expect(result.outcome).toBe('failed');
    expect(result.browserOpened).toBe(false);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns failed when authorizationUrl is missing but request succeeds', async () => {
    const client = await createInitializedClient();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      } else if (msg.method === 'mcpServer/oauth/login') {
        setTimeout(() => simulateResponse(msg.id, { status: 'no_url' }), 5);
      }
    });

    const result = await client.mcpServerOauthLogin('test-server', { timeoutSecs: 0.001 });

    expect(result.outcome).toBe('failed');
    expect(result.browserOpened).toBe(false);
    expect(result.errorReason).toBe('No authorizationUrl in response');
  }, 10000);
});
