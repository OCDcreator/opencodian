/**
 * ZCodeAppServerTransport.test.ts — process ownership and protocol plumbing.
 *
 * Failure-path focused: timeout, malformed frames, oversized frames,
 * premature exit, dispose/kill semantics, fail-closed server-request replies,
 * and the "close only the process owned by this adapter" cleanup contract.
 */
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  ZCodeAppServerTransport,
  ZCodeRemoteRequestError,
  ZCodeTransportError,
} from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeRuntimeLaunch } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

interface FakeChild {
  stdin: { write: jest.Mock<(chunk: string, callback?: (error?: Error) => void) => boolean> };
  stdout: EventEmitter & { setEncoding: jest.Mock };
  stderr: EventEmitter & { setEncoding: jest.Mock };
  on: (event: string, listener: (...args: unknown[]) => void) => FakeChild;
  kill: jest.Mock<(signal?: string) => boolean>;
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as unknown as FakeChild;
  child.stdin = {
    write: jest.fn((chunk: string, callback?: (error?: Error) => void) => {
      callback?.();
      return true;
    }),
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  child.kill = jest.fn(() => {
    child.killed = true;
    return true;
  });
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  return child;
}

const launch: ZCodeRuntimeLaunch = {
  command: '/runtime/zcode-agent',
  args: ['app-server', '--stdio'],
  entryKind: 'native-binary',
  entryPath: '/runtime/zcode-agent',
  source: 'configured',
  extraEnv: {},
};

describe('ZCodeAppServerTransport', () => {
  let child: FakeChild;
  let transport: ZCodeAppServerTransport;
  let spawnCalls: { command: string; args: string[]; env: Record<string, string> }[];

  function createTransport(overrides: Partial<ConstructorParameters<typeof ZCodeAppServerTransport>[0]> = {}): ZCodeAppServerTransport {
    spawnCalls = [];
    const spawnImpl = ((command: string, args: string[], options: { env: Record<string, string> }) => {
      spawnCalls.push({ command, args, env: options.env });
      return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
    }) as unknown as typeof import('node:child_process').spawn;
    return new ZCodeAppServerTransport({
      launch,
      baseEnv: { PATH: '/usr/bin', EMPTY: undefined },
      spawnImpl,
      requestTimeoutMs: 1000,
      ...overrides,
    });
  }

  function emitLine(line: string): void {
    child.stdout.emit('data', `${line}\n`);
  }

  function writtenFrames(): Record<string, unknown>[] {
    return child.stdin.write.mock.calls
      .map((call) => call[0] as string)
      .filter((chunk) => chunk.trim().length > 0)
      .map((chunk) => JSON.parse(chunk.trim()) as Record<string, unknown>);
  }

  beforeEach(() => {
    child = createFakeChild();
    transport = createTransport();
  });

  afterEach(() => {
    transport.dispose();
    jest.useRealTimers();
  });

  it('spawns only its own process with the official argv and controlled env', async () => {
    await transport.start();
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].command).toBe('/runtime/zcode-agent');
    expect(spawnCalls[0].args).toEqual(['app-server', '--stdio']);
    expect(spawnCalls[0].env.PATH).toBe('/usr/bin');
    expect('EMPTY' in spawnCalls[0].env).toBe(false);
  });

  it('correlates responses to requests', async () => {
    await transport.start();
    const pending = transport.request('runtime/capabilities', {});
    const frames = writtenFrames();
    expect(frames[0]['method']).toBe('runtime/capabilities');
    expect('jsonrpc' in frames[0]).toBe(false);
    emitLine(JSON.stringify({ id: frames[0]['id'], result: { independentPlanState: true } }));
    await expect(pending).resolves.toEqual({ independentPlanState: true });
  });

  it('times out a request and ignores its late response without corruption', async () => {
    jest.useFakeTimers();
    await transport.start();
    const pending = transport.request('session/list', {});
    const frames = writtenFrames();
    jest.advanceTimersByTime(1100);
    await expect(pending).rejects.toMatchObject({ reason: 'timeout' });
    // Late response for the timed-out id must not crash or resurrect work.
    emitLine(JSON.stringify({ id: frames[0]['id'], result: {} }));
    expect(transport.isAlive).toBe(true);
  });

  it('normalizes remote errors to structured codes, not message matching', async () => {
    await transport.start();
    const pending = transport.request('session/send', {});
    const frames = writtenFrames();
    emitLine(JSON.stringify({
      id: frames[0]['id'],
      error: { code: -32601, message: 'Method not found: session/send' },
    }));
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZCodeRemoteRequestError);
    expect((error as ZCodeRemoteRequestError).code).toBe(-32601);
  });

  it('tolerates unknown notification methods as honest drift', async () => {
    const seen: string[] = [];
    const violation = jest.fn();
    transport = createTransport({ onNotification: (method) => { seen.push(method); }, onProtocolViolation: violation });
    await transport.start();
    emitLine('{"method":"future/unknown.event","params":{}}');
    expect(seen).toEqual(['future/unknown.event']);
    expect(violation).not.toHaveBeenCalled();
    expect(transport.isAlive).toBe(true);
  });

  it('dispatches known notification handlers and survives handler exceptions', async () => {
    const handler = jest.fn(() => { throw new Error('handler bug'); });
    transport.onNotification('startup/storageState', handler);
    await transport.start();
    emitLine('{"method":"startup/storageState","params":{"phase":"ready"}}');
    expect(handler).toHaveBeenCalledWith({ phase: 'ready' });
    expect(transport.isAlive).toBe(true);
  });

  it('counts malformed frames and closes the stream only after the violation budget', async () => {
    const violations: string[] = [];
    transport = createTransport({ onProtocolViolation: (reason) => { violations.push(reason); } });
    await transport.start();
    const pending = transport.request('runtime/capabilities', {});
    for (let i = 0; i < 33; i += 1) {
      emitLine('this is not json');
    }
    expect(violations.length).toBeGreaterThan(32);
    await expect(pending).rejects.toMatchObject({ reason: 'protocol-corrupted' });
    expect(child.kill).toHaveBeenCalled();
  });

  it('closes immediately on an oversized frame (memory safety boundary)', async () => {
    transport = createTransport();
    await transport.start();
    const pending = transport.request('runtime/capabilities', {});
    child.stdout.emit('data', 'x'.repeat(9 * 1024 * 1024));
    await expect(pending).rejects.toMatchObject({ reason: 'protocol-corrupted' });
    expect(child.kill).toHaveBeenCalled();
  });

  it('rejects pending requests when the process exits prematurely', async () => {
    const onExit = jest.fn();
    transport = createTransport({ onExit });
    await transport.start();
    const pending = transport.request('runtime/capabilities', {});
    child.exitCode = 1;
    child.emit('exit', 1, null);
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZCodeTransportError);
    expect((error as ZCodeTransportError).reason).toBe('process-exit');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('reports the exit exactly once even after dispose', async () => {
    const onExit = jest.fn();
    transport = createTransport({ onExit });
    await transport.start();
    transport.dispose();
    child.exitCode = null;
    child.signalCode = 'SIGTERM';
    child.emit('exit', null, 'SIGTERM');
    child.emit('exit', null, 'SIGTERM');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('dispose kills only the owned child, escalates to SIGKILL, and is idempotent', async () => {
    jest.useFakeTimers();
    await transport.start();
    transport.dispose();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    jest.advanceTimersByTime(2500);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    transport.dispose();
    expect(child.kill).toHaveBeenCalledTimes(2);
  });

  it('rejects every pending request on dispose (no orphan promises)', async () => {
    await transport.start();
    const pending = transport.request('runtime/capabilities', {});
    transport.dispose();
    await expect(pending).rejects.toMatchObject({ reason: 'transport-closed' });
  });

  it('fails closed on unknown server requests instead of approving them', async () => {
    await transport.start();
    emitLine('{"id":"ask-1","method":"interaction/requestPermission","params":{"requestId":"r1"}}');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const replies = writtenFrames();
    expect(replies).toHaveLength(1);
    expect(replies[0]['id']).toBe('ask-1');
    const error = replies[0]['error'] as { code: number; message: string };
    expect(error.code).toBe(-32601);
    expect(error.message).toContain('interaction/requestPermission');
  });

  it('routes handled server requests and returns their result', async () => {
    transport.onServerRequest('interaction/requestUserInput', async () => ({ answer: 'hello' }));
    await transport.start();
    emitLine('{"id":"ask-2","method":"interaction/requestUserInput","params":{}}');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const replies = writtenFrames();
    expect(replies[0]).toEqual({ id: 'ask-2', result: { answer: 'hello' } });
  });

  it('answers a failing server-request handler with a structured error, fail-closed', async () => {
    transport.onServerRequest('interaction/requestUserInput', async () => { throw new Error('nope'); });
    await transport.start();
    emitLine('{"id":"ask-3","method":"interaction/requestUserInput","params":{}}');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const replies = writtenFrames();
    expect((replies[0]['error'] as { code: number }).code).toBe(-32603);
  });
});
