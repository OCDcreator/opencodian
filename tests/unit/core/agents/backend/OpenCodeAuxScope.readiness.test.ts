import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';

import type { AuxHttpRequest, AuxHttpResponse } from '../../../../../src/core/agents/backend/auxiliary/AuxTransport';
import { OPENCODE_AUX_AGENT,OpenCodeAuxScope } from '../../../../../src/core/agents/backend/auxiliary/OpenCodeAuxScope';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  mkdtempSync: jest.fn(() => '/owned-readiness-scope'),
  mkdirSync: jest.fn(), writeFileSync: jest.fn(), rmSync: jest.fn(),
  existsSync: jest.fn(() => true), statSync: jest.fn(() => ({ isFile: () => true })),
}));
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:net', () => ({ createServer: () => ({
  once: jest.fn(), listen: (_port: number, _host: string, callback: () => void) => callback(),
  address: () => ({ port: 5678 }), close: (callback: () => void) => callback(),
}) }));

function response(data: unknown): AuxHttpResponse {
  return { ok: true, status: 200, text: async () => '', json: async () => data };
}

function verificationResponse(url: string): AuxHttpResponse {
  const route = new URL(url).pathname;
  if (route === '/agent') return response([{ name: OPENCODE_AUX_AGENT, tools: { read: true }, permission:
    [...['edit', 'bash', 'task', 'todowrite', 'skill'].map(permission => ({ permission, pattern: '*', action: 'deny' })),
      { permission: '*', pattern: '*', action: 'deny' }] }]);
  if (route === '/experimental/tool/ids') return response(['read']);
  return response({});
}

describe.each<NodeJS.Platform>(['darwin', 'win32'])('OpenCodeAuxScope bounded readiness (%s)', (platform) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
    jest.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { pid: 1, stdout: new EventEmitter(), stderr: new EventEmitter(),
      exitCode: null, signalCode: 'SIGTERM', kill: jest.fn() });
    jest.mocked(spawn).mockImplementation((command) => {
      if (command === 'taskkill') {
        const killer = new EventEmitter();
        setTimeout(() => killer.emit('exit', 0), 0);
        return killer as never;
      }
      return child as never;
    });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    jest.useRealTimers();
  });

  it('aborts a hung readiness request and retries before native safety verification', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    let attempts = 0;
    const transport = jest.fn(async (url: string, request: AuxHttpRequest = {}) => {
      if (new URL(url).pathname === '/config') {
        attempts += 1; signals.push(request.signal);
        if (attempts === 1) return new Promise<AuxHttpResponse>(() => {});
      }
      return verificationResponse(url);
    });
    const scope = new OpenCodeAuxScope({ workingDirectory: '/vault', executablePath: '/owned/opencode', transport });
    const started = scope.ensureStarted('/vault');
    await jest.advanceTimersByTimeAsync(2500);
    await expect(started).resolves.toBe('http://127.0.0.1:5678');
    expect(signals[0]?.aborted).toBe(true);
    expect(attempts).toBe(2);
    expect(scope.getVerification().allowed).toEqual(['read']);
    const disposed = scope.dispose();
    await jest.advanceTimersByTimeAsync(600);
    await disposed;
  });

  it('fails closed within the total readiness deadline even if transport ignores abort', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const transport = jest.fn((_url: string, request: AuxHttpRequest = {}) => {
      signals.push(request.signal); return new Promise<AuxHttpResponse>(() => {});
    });
    const scope = new OpenCodeAuxScope({ workingDirectory: '/vault', executablePath: '/owned/opencode', transport });
    const started = scope.ensureStarted('/vault');
    const failed = started.then(() => { throw new Error('Unverified scope resolved'); },
      (error: Error) => { expect(error.message).toMatch(/did not become ready/); });
    await jest.advanceTimersByTimeAsync(61000);
    await failed;
    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every(signal => signal?.aborted)).toBe(true);
    expect(() => scope.getVerification()).toThrow(/not been verified/);
    expect(fs.rmSync).toHaveBeenCalledWith('/owned-readiness-scope', { recursive: true, force: true });
  });
});
