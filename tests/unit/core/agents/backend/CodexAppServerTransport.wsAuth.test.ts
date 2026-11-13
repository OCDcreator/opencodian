/**
 * CodexAppServerTransport — capability-token websocket auth (Codex 0.169.0).
 *
 * Verifies, at the real spawn/wire boundary:
 *   - the owned app-server is spawned with `--ws-auth capability-token
 *     --ws-token-sha256 <digest>` and the RAW token never appears in argv;
 *   - the WebSocket upgrade carries `Authorization: Bearer <token>` and the
 *     argv digest is exactly SHA-256 of that header token;
 *   - the unauthenticated fallback fires ONLY when the CLI's own stderr proves
 *     its argument parser rejected the auth flags (clap-style rejection line
 *     naming the flag); bare non-zero exits, usage-only flag mentions, spawn
 *     errors, and timeouts never trigger it;
 *   - the raw token is never written to diagnostics/log output;
 *   - stop() discards the token (a later start generates a fresh one).
 */
import type { spawn as SpawnFn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
/** Captured constructor args of every `new WebSocket(...)` in order. */
const wsConstructorCalls: Array<[string, { headers?: Record<string, string> }?]> = [];
const MockWebSocket = jest.fn().mockImplementation((...args: [string, { headers?: Record<string, string> }?]) => {
  wsConstructorCalls.push(args);
  return mockWsInstance;
});
jest.mock('ws', () => MockWebSocket);

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/codex/CodexAppServerClient';
import { hasWsAuthParserRejection } from '../../../../../src/core/agents/backend/codex/CodexAppServerSpawnSupport';
import { getRecentLogEntries } from '../../../../../src/shared';

type Proc = ReturnType<typeof SpawnFn>;

function createMockProcess(): Proc {
  const proc = new EventEmitter() as unknown as Proc;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function emitWsUrl(proc: Proc): void {
  setTimeout(() => {
    (proc as unknown as { stdout: EventEmitter }).stdout.emit(
      'data',
      Buffer.from('App server listening on ws://127.0.0.1:12345\n'),
    );
  }, 5);
}

function emitExit(proc: Proc, code: number): void {
  setTimeout(() => {
    (proc as unknown as EventEmitter).emit('exit', code);
  }, 5);
}

function emitSpawnError(proc: Proc, error: Error): void {
  setTimeout(() => {
    (proc as unknown as EventEmitter).emit('error', error);
  }, 5);
}

function replyInitialize(): void {
  mockWsInstance.send.mockImplementation((data: string) => {
    const msg = JSON.parse(data) as { id: number; method: string };
    if (msg.method === 'initialize') {
      setTimeout(() => {
        mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) });
      }, 5);
    }
  });
}

function spawnArgsOf(callIndex: number): string[] {
  return mockSpawn.mock.calls[callIndex][1] as string[];
}

describe('hasWsAuthParserRejection — restricted parser-rejection proof', () => {
  it('accepts clap 4 / clap 3 rejection lines naming an auth flag', () => {
    expect(hasWsAuthParserRejection("error: unexpected argument '--ws-auth' found\n\nUsage: codex app-server [OPTIONS]\n")).toBe(true);
    expect(hasWsAuthParserRejection("error: Found argument '--ws-token-sha256' which wasn't expected, or isn't valid in this context\n")).toBe(true);
    expect(hasWsAuthParserRejection('error: unknown option \'--ws-auth\'\n')).toBe(true);
  });

  it('rejects usage/help lines that merely mention the flags', () => {
    expect(hasWsAuthParserRejection(
      'error: failed to bind port 0\n\nUsage: codex app-server [OPTIONS] --listen <LISTEN_ADDRESS>\n\nOptions:\n      --ws-auth <MODE>  Authentication mode for incoming WebSocket connections\n      --ws-token-sha256 <HEX>\n',
    )).toBe(false);
  });

  it('rejects unrelated error lines and flag-free text', () => {
    expect(hasWsAuthParserRejection('Error: failed to load config.toml: permission denied\n')).toBe(false);
    expect(hasWsAuthParserRejection("error: unexpected argument '--listen' found\n")).toBe(false);
    expect(hasWsAuthParserRejection('')).toBe(false);
  });
});

describe('CodexAppServerTransport capability-token websocket auth', () => {
  /** Every diagnostics line emitted while the spies are installed. */
  let recordedLogLines: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    wsConstructorCalls.length = 0;
    mockWsInstance.onopen = null;
    mockWsInstance.onmessage = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onclose = null;
    recordedLogLines = [];
    for (const level of ['log', 'warn', 'info', 'error'] as const) {
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        recordedLogLines.push(args.map((part) => String(part)).join(' '));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('spawns with --ws-auth capability-token + sha256 digest (raw token never in argv) and upgrades with the bearer header', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    replyInitialize();

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await client.start();

    const args = spawnArgsOf(0);
    const listenIndex = args.indexOf('--listen');
    expect(args.slice(0, listenIndex)).toEqual(['app-server']);
    expect(args[listenIndex + 1]).toBe('ws://127.0.0.1:0');
    expect(args).toContain('--ws-auth');
    expect(args[args.indexOf('--ws-auth') + 1]).toBe('capability-token');
    const digestIndex = args.indexOf('--ws-token-sha256');
    const digest = args[digestIndex + 1];
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    const token = (client as unknown as { wsAuthToken: string }).wsAuthToken;
    expect(token).toBeTruthy();
    expect(args).not.toContain(token);
    expect(createHash('sha256').update(token).digest('hex')).toBe(digest);

    expect(wsConstructorCalls).toHaveLength(1);
    const [url, options] = wsConstructorCalls[0];
    expect(url).toBe('ws://127.0.0.1:12345');
    expect(options?.headers?.Authorization).toBe(`Bearer ${token}`);

    await client.stop();
  });

  it('never writes the raw capability token to log/diagnostic output', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitWsUrl(proc);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    replyInitialize();

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await client.start();
    const token = (client as unknown as { wsAuthToken: string }).wsAuthToken;

    // Both diagnostics surfaces: the console sinks captured by the spies and
    // the shared logger ring buffer (which records emitted warn/error lines).
    const loggerText = getRecentLogEntries().map((entry) => `${entry.scope} ${entry.message}`).join('\n');
    const combined = `${recordedLogLines.join('\n')}\n${loggerText}`;
    expect(combined).not.toContain(token);
    expect(combined).not.toContain(JSON.stringify(token).slice(1, -1));

    await client.stop();
  });

  it('falls back exactly once when the CLI stderr PROVES the parser rejected --ws-auth (clap-style exit 2)', async () => {
    const failing = createMockProcess();
    const working = createMockProcess();
    mockSpawn.mockReturnValueOnce(failing).mockReturnValueOnce(working);
    setTimeout(() => {
      (failing as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from("error: unexpected argument '--ws-auth' found\n\nUsage: codex app-server [OPTIONS]\n"));
    }, 5);
    emitExit(failing, 2);
    emitWsUrl(working);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    replyInitialize();

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await client.start();

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(spawnArgsOf(0)).toContain('--ws-auth');
    expect(spawnArgsOf(1)).not.toContain('--ws-auth');
    expect(spawnArgsOf(1)).not.toContain('--ws-token-sha256');
    expect((client as unknown as { wsAuthToken: string }).wsAuthToken).toBeNull();
    expect(wsConstructorCalls).toHaveLength(1);
    expect(wsConstructorCalls[0][1]?.headers?.Authorization).toBeUndefined();
    // The degradation is honestly logged, without any token material.
    expect(recordedLogLines.some((line) => line.includes('falling back to an unauthenticated loopback'))).toBe(true);
    // The rejected attempt is killed before the retry so no orphan process stays.
    expect((failing as unknown as { kill: jest.Mock }).kill).toHaveBeenCalled();

    await client.stop();
  });

  it('does NOT downgrade on a bare non-zero exit without parser-rejection evidence (config failure)', async () => {
    const failing = createMockProcess();
    mockSpawn.mockReturnValue(failing);
    setTimeout(() => {
      (failing as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from('Error: failed to load config.toml: permission denied\n'));
    }, 5);
    emitExit(failing, 78);

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await expect(client.start()).rejects.toThrow('App-server exited with code 78');

    // Fail-closed: exactly one spawn, capability token intact, no degradation log.
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).not.toBeNull();
    expect(recordedLogLines.some((line) => line.includes('falling back to an unauthenticated loopback'))).toBe(false);
    await client.stop();
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).toBeNull();
  });

  it('does not confuse usage/help flag mentions (no rejection phrase) with a parser rejection', async () => {
    const failing = createMockProcess();
    mockSpawn.mockReturnValue(failing);
    setTimeout(() => {
      (failing as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from(
        "error: failed to bind port 0\n\nUsage: codex app-server [OPTIONS] --listen <LISTEN_ADDRESS>\n\nOptions:\n      --listen <LISTEN_ADDRESS>\n      --ws-auth <MODE>  Authentication mode for incoming WebSocket connections\n",
      ));
    }, 5);
    emitExit(failing, 1);

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await expect(client.start()).rejects.toThrow('App-server exited with code 1');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect((client as unknown as { wsAuthToken: string | null }).wsAuthToken).not.toBeNull();
    await client.stop();
  });

  it('does not fall back for non-flag spawn failures', async () => {
    const proc = createMockProcess();
    mockSpawn.mockReturnValue(proc);
    emitSpawnError(proc, new Error('spawn /mock/codex ENOENT'));

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await expect(client.start()).rejects.toThrow('ENOENT');

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect((client as unknown as { wsAuthToken: string }).wsAuthToken).not.toBeNull();
    await client.stop();
    expect((client as unknown as { wsAuthToken: string }).wsAuthToken).toBeNull();
  });

  it('generates a fresh token on the next start after stop()', async () => {
    const first = createMockProcess();
    mockSpawn.mockReturnValueOnce(first);
    emitWsUrl(first);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    replyInitialize();

    const client = new CodexAppServerClient({ codexPathOverride: '/mock/codex' });
    await client.start();
    const firstToken = (client as unknown as { wsAuthToken: string }).wsAuthToken;
    await client.stop();

    const second = createMockProcess();
    mockSpawn.mockReturnValueOnce(second);
    emitWsUrl(second);
    setTimeout(() => mockWsInstance.onopen?.(), 10);
    replyInitialize();
    await client.start();
    const secondToken = (client as unknown as { wsAuthToken: string }).wsAuthToken;

    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);
    await client.stop();
  });
});
