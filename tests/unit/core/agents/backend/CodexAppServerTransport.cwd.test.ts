/**
 * CodexAppServerTransport — owned app-server process spawn cwd.
 *
 * Verifies that when a workingDirectory (the active vault path) is provided,
 * the owned Codex app-server process is spawned with that cwd so
 * project-scoped resources (.agents/skills) resolve. Without it, the server
 * inherits the plugin process cwd and project skills are invisible.
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

describe('CodexAppServerClient spawn cwd propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.onopen = null;
    mockWsInstance.onmessage = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onclose = null;
  });

  /** Drive start() to completion: ws URL + open + initialize handshake. */
  async function startClient(workingDirectory?: string): Promise<void> {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    mockWsInstance.send.mockImplementation((data: string) => {
      const msg = JSON.parse(data);
      if (msg.method === 'initialize') {
        setTimeout(() => {
          mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) });
        }, 5);
      }
    });
    const client = new CodexAppServerClient({
      codexPathOverride: '/mock/codex',
      ...(workingDirectory ? { workingDirectory } : {}),
    });
    await client.start();
  }

  it('spawns the owned app-server with the provided workingDirectory as cwd', async () => {
    await startClient('/vault');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [, args, options] = mockSpawn.mock.calls[0];
    expect(args).toContain('app-server');
    expect(options).toMatchObject({ cwd: '/vault' });
  });

  it('omits cwd when no workingDirectory is provided (inherits plugin cwd)', async () => {
    await startClient();

    const [, , options] = mockSpawn.mock.calls[0];
    expect(options).not.toHaveProperty('cwd');
  });
});
