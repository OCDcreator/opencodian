/**
 * Real unit tests for the Codex 0.159.0 typed server→client request
 * registrations (item/commandExecution/requestApproval,
 * item/fileChange/requestApproval, item/permissions/requestApproval,
 * item/tool/requestUserInput, mcpServer/elicitation/request) and the
 * dedicated deprecationNotice subscription.
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

function simulateServerRequest(id: number, method: string, params: unknown) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
}

describe('CodexAppServerClient 0.159.0 server-request registrations', () => {
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

  it('routes item/commandExecution/requestApproval to the typed handler', async () => {
    const client = await createClient();
    const handler = jest.fn().mockReturnValue({
      decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['allow npm test'] } },
    });
    client.registerCommandExecutionApprovalHandler(handler);

    const params = {
      threadId: 't1', turnId: 'turn-1', itemId: 'item-1', startedAtMs: 123,
      command: ['npm', 'test'], cwd: '/vault', kind: 'command',
    };
    simulateServerRequest(501, 'item/commandExecution/requestApproval', params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledWith(params);
    expect(lastSentMessage()).toEqual({
      jsonrpc: '2.0',
      id: 501,
      result: { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['allow npm test'] } } },
    });
  });

  it('routes item/fileChange/requestApproval to the typed handler', async () => {
    const client = await createClient();
    const handler = jest.fn().mockReturnValue({ decision: 'acceptForSession' });
    client.registerFileChangeApprovalHandler(handler);

    const params = { threadId: 't1', turnId: 'turn-1', itemId: 'item-2', startedAtMs: 5, grantRoot: '/vault' };
    simulateServerRequest(502, 'item/fileChange/requestApproval', params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledWith(params);
    expect(lastSentMessage()).toEqual({ jsonrpc: '2.0', id: 502, result: { decision: 'acceptForSession' } });
  });

  it('routes item/permissions/requestApproval and echoes the granted profile', async () => {
    const client = await createClient();
    const handler = jest.fn().mockImplementation((p: { permissions: unknown }) => ({
      permissions: p.permissions,
      scope: 'session',
    }));
    client.registerPermissionsApprovalHandler(handler);

    const params = {
      threadId: 't1', turnId: 'turn-1', itemId: 'item-3', startedAtMs: 7,
      cwd: '/vault', permissions: { network: { enabled: true } },
    };
    simulateServerRequest(503, 'item/permissions/requestApproval', params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledWith(params);
    expect(lastSentMessage()).toEqual({
      jsonrpc: '2.0',
      id: 503,
      result: { permissions: { network: { enabled: true } }, scope: 'session' },
    });
  });

  it('routes item/tool/requestUserInput and replies with parallel answers', async () => {
    const client = await createClient();
    const handler = jest.fn().mockReturnValue({ answers: [{ answers: ['blue'] }] });
    client.registerToolUserInputHandler(handler);

    const params = {
      threadId: 't1', turnId: 'turn-1', itemId: 'item-4', isBlocking: true,
      questions: [{ id: 'q1', header: 'Pick', question: 'Favorite color?' }],
    };
    simulateServerRequest(504, 'item/tool/requestUserInput', params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledWith(params);
    expect(lastSentMessage()).toEqual({ jsonrpc: '2.0', id: 504, result: { answers: [{ answers: ['blue'] }] } });
  });

  it('routes mcpServer/elicitation/request to the typed handler', async () => {
    const client = await createClient();
    const handler = jest.fn().mockReturnValue({ action: 'accept', content: { apiKey: 'x' } });
    client.registerMcpElicitationHandler(handler);

    const params = { serverName: 'srv', threadId: 't1', turnId: 'turn-1' };
    simulateServerRequest(505, 'mcpServer/elicitation/request', params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledWith(params);
    expect(lastSentMessage()).toEqual({ jsonrpc: '2.0', id: 505, result: { action: 'accept', content: { apiKey: 'x' } } });
  });

  it('still replies -32601 when a v2 route has no registered handler', async () => {
    await createClient();

    simulateServerRequest(506, 'item/permissions/requestApproval', { threadId: 't1' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const reply = lastSentMessage();
    expect(reply.id).toBe(506);
    expect(reply.error).toEqual({ code: -32601, message: expect.stringContaining('item/permissions/requestApproval') });
    expect(reply.result).toBeUndefined();
  });

  it('re-registering replaces the previous handler for the same route', async () => {
    const client = await createClient();
    const first = jest.fn();
    client.registerMcpElicitationHandler(first);
    client.registerMcpElicitationHandler(() => ({ action: 'decline' }));

    simulateServerRequest(507, 'mcpServer/elicitation/request', { serverName: 'srv', threadId: 't1' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(first).not.toHaveBeenCalled();
    expect(lastSentMessage()).toEqual({ jsonrpc: '2.0', id: 507, result: { action: 'decline' } });
  });
});

describe('CodexAppServerClient.subscribeToDeprecationNotice', () => {
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

  it('forwards deprecationNotice params to the dedicated callback', async () => {
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

    const notices: Array<{ summary: string; details?: string | null }> = [];
    const unsubscribe = client.subscribeToDeprecationNotice((notice) => notices.push(notice));

    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method: 'deprecationNotice', params: { summary: 'X is deprecated', details: 'Use Y' } }),
    });
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method: 'deprecationNotice', params: { summary: 'Z is deprecated' } }),
    });
    // Malformed payload without summary is dropped.
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method: 'deprecationNotice', params: {} }),
    });

    expect(notices).toEqual([
      { summary: 'X is deprecated', details: 'Use Y' },
      { summary: 'Z is deprecated' },
    ]);

    unsubscribe();
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method: 'deprecationNotice', params: { summary: 'late' } }),
    });
    expect(notices).toHaveLength(2);
  });
});
