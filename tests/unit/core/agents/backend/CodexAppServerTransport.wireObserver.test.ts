/**
 * Unit tests for CodexAppServerTransport wire observer instrumentation.
 *
 * Verifies that the optional `wireObserver` hook fires for:
 *   - connection lifecycle states (starting/ws-url/connected/initialized),
 *   - outbound client requests + inbound responses (with durationMs),
 *   - notifications, server-initiated requests, and server-request replies,
 *
 * WITHOUT affecting the JSON-RPC main path. The mock boilerplate mirrors the
 * proven pattern in CodexAppServerClient.threadLifecycle.test.ts:10-55.
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
(MockWebSocket as unknown as { OPEN: number }).OPEN = 1;
jest.mock('ws', () => MockWebSocket);

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';
import type { CodexAppServerWireObserver } from '../../../../../src/core/agents/backend/CodexAppServerClientTypes';

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function emitWsUrl(proc: ReturnType<typeof SpawnFn>): void {
  setTimeout(() => {
    (proc as unknown as { stdout: EventEmitter }).stdout.emit(
      'data',
      Buffer.from('App server listening on ws://127.0.0.1:12345\n'),
    );
  }, 5);
}

function simulateResponse(id: number, result: unknown): void {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  mockWsInstance.onmessage?.({ data: response });
}

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

describe('CodexAppServerTransport wire observer', () => {
  beforeEach(resetAppServerMocks);

  /** Drive start() to completion with a wire observer attached. */
  async function startClient(observer?: CodexAppServerWireObserver): Promise<CodexAppServerClient> {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });
    const client = new CodexAppServerClient({ wireObserver: observer });
    await client.start();
    return client;
  }

  it('reports connection lifecycle states', async () => {
    const states: string[] = [];
    await startClient({ onConnection: ({ state }) => states.push(state) });
    expect(states).toEqual(expect.arrayContaining(['starting', 'ws-url', 'connected', 'initialized']));
  });

  it('reports outbound requests and inbound responses with duration', async () => {
    const seen: Array<{ kind: string; method?: string; ok?: boolean; durationMs?: number }> = [];
    const client = await startClient({
      onRequest: ({ method }) => seen.push({ kind: 'request', method }),
      onResponse: ({ ok, durationMs }) => seen.push({ kind: 'response', ok, durationMs }),
    });

    // listThreads triggers a `thread/list` request; reply so it resolves.
    const pending = client.listThreads();
    // listThreads awaits start() internally, so the ws.send for thread/list
    // runs in a later microtask; flush before reading send.mock.calls.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sent = mockWsInstance.send.mock.calls
      .map((call) => JSON.parse(call[0] as string))
      .find((msg) => msg.method === 'thread/list');
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { data: [] } }),
    });
    await pending;

    expect(seen).toContainEqual({ kind: 'request', method: 'thread/list' });
    const response = seen.find((entry) => entry.kind === 'response');
    expect(response?.ok).toBe(true);
    expect(typeof response?.durationMs).toBe('number');
  });

  it('reports notifications and server requests', async () => {
    const seen: string[] = [];
    const client = await startClient({
      onNotification: ({ method }) => seen.push(`n:${method}`),
      onServerRequest: ({ method }) => seen.push(`s:${method}`),
      onServerReply: ({ ok }) => seen.push(`reply:${ok}`),
    });

    // Notification: method, no id.
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', method: 'warning', params: { threadId: 't1' } }),
    });
    // Server-initiated request: method + id. Register a success handler so the
    // reply is a result (ok:true), not a -32601 method-not-found error.
    client.registerServerRequestHandler('execCommandApproval', () => ({ decision: 'allow' }));
    mockWsInstance.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'execCommandApproval', params: {} }),
    });
    // Let the async handler in handleServerRequest run.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(seen).toContain('n:warning');
    expect(seen).toContain('s:execCommandApproval');
    expect(seen).toContain('reply:true');
  });

  it('keeps legacy stderr logging when no service-output observer is configured', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      await startClient();
      warn.mockClear();
      const proc = mockSpawn.mock.results.at(-1)?.value as ReturnType<typeof SpawnFn>;
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Error: raw-stderr-secret'));
      expect(warn.mock.calls.some((call) => JSON.stringify(call).includes('raw-stderr-secret'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps legacy stderr logging when a service-output observer dynamically declines capture', async () => {
    const observer: CodexAppServerWireObserver = { onServiceOutput: () => false };
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      await startClient(observer);
      warn.mockClear();
      const proc = mockSpawn.mock.results.at(-1)?.value as ReturnType<typeof SpawnFn>;
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Error: disabled-trace-stderr'));
      expect(warn.mock.calls.some((call) => JSON.stringify(call).includes('disabled-trace-stderr'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('uses only generic logging when a service-output observer throws', async () => {
    const observer: CodexAppServerWireObserver = {
      onServiceOutput: () => { throw new Error('observer-secret'); },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      await startClient(observer);
      warn.mockClear();
      const proc = mockSpawn.mock.results.at(-1)?.value as ReturnType<typeof SpawnFn>;
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Error: raw-stderr-secret'));
      const output = JSON.stringify(warn.mock.calls);
      expect(output).toContain('App-server stderr received');
      expect(output).not.toContain('raw-stderr-secret');
      expect(output).not.toContain('observer-secret');
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps startup on the main path when service-output observer getter throws', async () => {
    const getterSecret = 'wire-observer-getter-secret';
    const observer = {} as CodexAppServerWireObserver;
    Object.defineProperty(observer, 'onServiceOutput', {
      configurable: true,
      get: () => {
        throw new Error(getterSecret);
      },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      await expect(startClient(observer)).resolves.toBeDefined();
      const proc = mockSpawn.mock.results.at(-1)?.value as ReturnType<typeof SpawnFn>;
      (proc as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Error: getter-raw-stderr-secret'));
      const output = JSON.stringify(warn.mock.calls);
      expect(output).toContain('App-server stderr received');
      expect(output).not.toContain(getterSecret);
      expect(output).not.toContain('getter-raw-stderr-secret');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not expose observer exception secrets in console output', async () => {
    const observer: CodexAppServerWireObserver = {
      onNotification: () => { throw new Error('sk-observer-canary /vault/private'); },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    try {
      await startClient(observer);
      warn.mockClear();
      mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'warning', params: {} }) });
      const output = JSON.stringify(warn.mock.calls);
      expect(output).toContain('wire observer threw');
      expect(output).not.toContain('sk-observer-canary');
      expect(output).not.toContain('/vault/private');
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a timed-out request as an observer failure response', async () => {
    const responses: Array<{ id: number; ok: boolean; error?: string }> = [];
    const client = await startClient({ onResponse: (response) => responses.push(response) });
    const request = (client as unknown as {
      request(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
    }).request('slow/request', {}, 1);
    await expect(request).rejects.toThrow('JSON-RPC request timeout for slow/request');
    expect(responses).toContainEqual(expect.objectContaining({ ok: false, error: 'JSON-RPC request timeout for slow/request' }));
  });
});
