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

function simulateError(id: number, error: { code: number; message: string }): void {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error });
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

describe('CodexAppServerClient readMcpServerResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.send.mockClear();
    mockWsInstance.readyState = 1;
    mockWsInstance.onopen = null;
    mockWsInstance.onmessage = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onclose = null;
  });

  it('sends mcpServer/resource/read with { server, uri } params and returns contents', async () => {
    const client = await createInitializedClient();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'mcpServer/resource/read') {
        setTimeout(() => simulateResponse(msg.id, {
          contents: [{ uri: 'probe://guide/getting-started', mimeType: 'text/plain', text: '# Getting Started\n\nSample text.' }],
        }), 5);
      }
    });

    const result = await client.readMcpServerResource('resource_probe', 'probe://guide/getting-started');

    // Verify the request was sent with the correct { server, uri } param shape.
    const sent = mockWsInstance.send.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .find((m) => m.method === 'mcpServer/resource/read');
    expect(sent).toBeDefined();
    expect(sent.params).toEqual({ server: 'resource_probe', uri: 'probe://guide/getting-started' });

    expect(result).not.toBeNull();
    expect(result!.contents).toHaveLength(1);
    expect(result!.contents[0].text).toBe('# Getting Started\n\nSample text.');
    expect(result!.contents[0].mimeType).toBe('text/plain');
    expect(result!.errorReason).toBeUndefined();
  });

  it('returns empty contents when app-server returns no contents array', async () => {
    const client = await createInitializedClient();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'mcpServer/resource/read') {
        setTimeout(() => simulateResponse(msg.id, {}), 5);
      }
    });

    const result = await client.readMcpServerResource('srv', 'uri://x');

    expect(result).not.toBeNull();
    expect(result!.contents).toEqual([]);
  });

  it('returns errorReason when app-server returns a JSON-RPC error', async () => {
    const client = await createInitializedClient();

    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'mcpServer/resource/read') {
        setTimeout(() => simulateError(msg.id, { code: -32600, message: 'resource not found' }), 5);
      }
    });

    const result = await client.readMcpServerResource('srv', 'uri://missing');

    expect(result).not.toBeNull();
    expect(result!.contents).toEqual([]);
    expect(result!.errorReason).toContain('resource not found');
  });
});
