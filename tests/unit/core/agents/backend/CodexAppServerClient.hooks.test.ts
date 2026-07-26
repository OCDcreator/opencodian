/**
 * G10b Codex app-server hooks/list readback contract.
 *
 * These tests exercise the real client against a small JSON-RPC WebSocket
 * harness. The route is read-only: the request must carry only `{ cwds? }`
 * and the response must retain cwd groups, warnings/errors, and the verified
 * HookMetadata fields without exposing unknown wire fields.
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

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function simulateResponse(id: number, result: unknown): void {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function simulateError(id: number, error: { code: number; message: string }): void {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error }) });
}

async function createClient(
  hooksReply: unknown,
  options: { error?: { code: number; message: string }; startError?: Error } = {},
): Promise<{ client: CodexAppServerClient; sent: Array<Record<string, unknown>> }> {
  const proc = createMockProcess();
  mockSpawn.mockReturnValue(proc);
  setTimeout(() => proc.stdout?.emit('data', Buffer.from('ws://127.0.0.1:12345\n')), 1);
  setTimeout(() => mockWsInstance.onopen?.(), 2);

  const sent: Array<Record<string, unknown>> = [];
  mockWsInstance.send.mockImplementation((data: string) => {
    const message = JSON.parse(data) as Record<string, unknown>;
    sent.push(message);
    if (message.method === 'initialize') {
      setTimeout(() => simulateResponse(message.id as number, {}), 1);
      return;
    }
    if (message.method !== 'hooks/list') return;
    setTimeout(() => {
      if (options.error) {
        simulateError(message.id as number, options.error);
      } else {
        simulateResponse(message.id as number, hooksReply);
      }
    }, 1);
  });

  const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });
  if (options.startError) {
    mockSpawn.mockImplementationOnce(() => {
      throw options.startError;
    });
  }
  return { client, sent };
}

describe('CodexAppServerClient.listHooks', () => {
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

  it('sends exact cwds params and preserves groups, warnings/errors, and known metadata while dropping unknown fields', async () => {
    const { client, sent } = await createClient({
      data: [
        {
          cwd: '/vault',
          hooks: [{
            key: 'hook-1',
            eventName: 'preToolUse',
            handlerType: 'command',
            matcher: null,
            command: 'echo ok',
            timeoutSec: 30,
            statusMessage: null,
            sourcePath: '/vault/.codex/hooks.json',
            source: 'project',
            pluginId: null,
            displayOrder: 0,
            enabled: true,
            isManaged: false,
            currentHash: 'sha256:abc',
            trustStatus: 'trusted',
            unknownField: 'drop me',
          }],
          warnings: ['project config is untrusted'],
          errors: [{ path: '/vault/.codex/hooks.json', message: 'invalid command' }],
          unknownGroupField: true,
        },
      ],
    });

    const result = await client.listHooks({ cwds: ['/vault', '/other'] });

    expect(sent.find((message) => message.method === 'hooks/list')?.params).toEqual({ cwds: ['/vault', '/other'] });
    expect(result).toEqual({
      status: 'available',
      groups: [{
        cwd: '/vault',
        hooks: [{
          key: 'hook-1',
          eventName: 'preToolUse',
          handlerType: 'command',
          matcher: null,
          command: 'echo ok',
          timeoutSec: 30,
          statusMessage: null,
          sourcePath: '/vault/.codex/hooks.json',
          source: 'project',
          pluginId: null,
          displayOrder: 0,
          enabled: true,
          isManaged: false,
          currentHash: 'sha256:abc',
          trustStatus: 'trusted',
        }],
        warnings: ['project config is untrusted'],
        errors: [{ path: '/vault/.codex/hooks.json', message: 'invalid command' }],
      }],
    });
  });

  it('returns empty for a valid empty group per cwd', async () => {
    const { client } = await createClient({
      data: [
        { cwd: '/vault', hooks: [], warnings: [], errors: [] },
        { cwd: '/other', hooks: [], warnings: [], errors: [] },
      ],
    });

    await expect(client.listHooks({ cwds: ['/vault', '/other'] })).resolves.toEqual({
      status: 'empty',
      groups: [
        { cwd: '/vault', hooks: [], warnings: [], errors: [] },
        { cwd: '/other', hooks: [], warnings: [], errors: [] },
      ],
    });
  });

  it('sends an empty params object when options are absent', async () => {
    const { client, sent } = await createClient({ data: [] });

    await client.listHooks();

    expect(sent.find((message) => message.method === 'hooks/list')?.params).toEqual({});
  });

  it('returns malformed for a successful response with invalid data shape', async () => {
    const { client } = await createClient({ data: [{ cwd: '/vault', hooks: 'not-an-array', warnings: [], errors: [] }] });

    await expect(client.listHooks()).resolves.toMatchObject({ status: 'malformed', groups: [] });
  });

  it('returns malformed when a hook lacks required identity fields', async () => {
    const { client } = await createClient({ data: [{ cwd: '/vault', hooks: [{}], warnings: [], errors: [] }] });

    await expect(client.listHooks()).resolves.toMatchObject({ status: 'malformed', groups: [] });
  });

  it('returns unavailable for an unsupported hooks/list route', async () => {
    const { client } = await createClient(undefined, { error: { code: -32601, message: 'Method not found: hooks/list' } });

    await expect(client.listHooks()).resolves.toMatchObject({ status: 'unavailable', groups: [] });
  });

  it('returns failed for a rejected/invalid request and preserves the reason', async () => {
    const { client } = await createClient(undefined, { error: { code: -32600, message: 'Invalid request: cwds must be a sequence' } });

    await expect(client.listHooks({ cwds: '/tmp' as unknown as string[] })).resolves.toEqual({
      status: 'failed',
      groups: [],
      errorReason: 'JSON-RPC error -32600: Invalid request: cwds must be a sequence',
    });
  });
});
