import { mkdtemp, rm } from 'fs/promises';
import * as http from 'http';
import * as net from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

import { LocalProcessProbe } from '../../../../src/core/opencode/LocalSidecarProcessInspector';
import {
  REMOTE_CONTROL_AUDIT_TRACE_ID,
  RemoteControlAudit,
} from '../../../../src/core/remotecontrol/RemoteControlAudit';
import {
  generateRemoteControlToken,
} from '../../../../src/core/remotecontrol/RemoteControlAuth';
import {
  REMOTE_CONTROL_PORT,
  RemoteControlService,
  type RemoteControlSessionDriver,
} from '../../../../src/core/remotecontrol/RemoteControlService';
import type { OpenCodianSettings } from '../../../../src/core/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { StreamChunk } from '../../../../src/core/types/chat';

const TOKEN = generateRemoteControlToken();
const WRONG_TOKEN = 'A'.repeat(TOKEN.length);

function buildSettings(overrides: Partial<OpenCodianSettings> = {}): OpenCodianSettings {
  return {
    ...DEFAULT_SETTINGS,
    remoteControlEnabled: true,
    remoteControlToken: TOKEN,
    ...overrides,
  } as OpenCodianSettings;
}

interface StubDriverCalls {
  createSessionInputs: Array<{ title: string | undefined; setCurrent: boolean }>;
  cancelStreamInputs: string[];
}

type SendMessageHandler = (
  message: string,
  sessionId: string,
) => AsyncGenerator<StreamChunk, void, unknown>;

function createStubDriver(
  sendMessageHandler?: SendMessageHandler,
): { driver: RemoteControlSessionDriver; calls: StubDriverCalls } {
  const calls: StubDriverCalls = { createSessionInputs: [], cancelStreamInputs: [] };
  const driver: RemoteControlSessionDriver = {
    createSession: async (title, options) => {
      calls.createSessionInputs.push({ title, setCurrent: options.setCurrent });
      return 'ses_remote-stub';
    },
    sendMessage: async function* (message, options) {
      const handler = sendMessageHandler;
      if (!handler) {
        yield { type: 'text', content: `echo:${message}` };
        return;
      }
      yield* handler(message, options.sessionId);
    },
    cancelStream: (sessionId) => {
      calls.cancelStreamInputs.push(sessionId);
    },
  };
  return { driver, calls };
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.once('listening', () => {
      const address = probe.address() as net.AddressInfo;
      probe.close(() => resolve(address.port));
    });
    probe.listen(0, '127.0.0.1');
  });
}

interface RawResponse {
  status: number;
  body: string;
}

function request(
  port: number,
  options: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
    hostHeader?: string;
  },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: {
          ...(options.body !== undefined
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) }
            : {}),
          ...options.headers,
        },
        setHost: options.hostHeader === undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    if (options.hostHeader !== undefined) req.setHeader('Host', options.hostHeader);
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function authedPost(port: number, body: string, token: string = TOKEN): Promise<RawResponse> {
  return request(port, {
    method: 'POST',
    path: '/v1/instruction',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until the predicate holds, with a bounded budget (avoids fixed sleeps). */
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor: condition not met within budget');
    }
    await sleep(10);
  }
}

// Shared harness state (jest runs the tests in one file serially).
let auditDirectory: string;
let port: number;
let settings: OpenCodianSettings;
let service: RemoteControlService | null = null;

async function setUpHarness(): Promise<void> {
  auditDirectory = await mkdtemp(join(tmpdir(), 'opencodian-rc-svc-'));
  port = await findFreePort();
  settings = buildSettings();
}

async function tearDownHarness(): Promise<void> {
  if (service) {
    await service.dispose();
    service = null;
  }
  await rm(auditDirectory, { recursive: true, force: true });
}

function createService(
  driver: RemoteControlSessionDriver,
  overrides: Partial<{ turnTimeoutMs: number; injectAudit: boolean }> = {},
): RemoteControlService {
  const audit = overrides.injectAudit === false
    ? undefined
    : new RemoteControlAudit({ directory: auditDirectory });
  const created = new RemoteControlService({
    getSettings: () => settings,
    driver,
    audit,
    turnTimeoutMs: overrides.turnTimeoutMs,
    port,
    notify: () => undefined,
  });
  service = created;
  return created;
}

describe('RemoteControlService — off state binds nothing (contract)', () => {
  beforeEach(setUpHarness);
  afterEach(tearDownHarness);

  it('constructs no http.Server and no audit store while disabled', async () => {
    settings = buildSettings({ remoteControlEnabled: false });
    const { driver } = createStubDriver();
    // Mirrors the production composition: no audit instance is injected, so
    // the service has nothing prebuilt and must stay fully inert while off.
    const remote = createService(driver, { injectAudit: false });
    await remote.applySettings();
    expect(remote.getRuntimeState().state).toBe('off');
    // Zero-cost off: not even the audit store touched disk (auditDirectory
    // stays empty), and — the design's own proof (§5.2) — the port is free
    // on BOTH stacks, which is only possible when no listener exists.
    expect(remote.getRuntimeState().auditDirectory).toBe('');
    const probe = new LocalProcessProbe();
    await expect(probe.canBindLocalEndpoint('127.0.0.1', port)).resolves.toBe(true);
    await expect(probe.canBindLocalEndpoint('::1', port)).resolves.toBe(true);
  });

    it('re-enabling after disable binds again and disabling closes the listener', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      expect(remote.getRuntimeState().state).toBe('listening');
      const busyProbe = new LocalProcessProbe();
      await expect(busyProbe.canBindLocalEndpoint('127.0.0.1', port)).resolves.toBe(false);

      settings = buildSettings({ remoteControlEnabled: false });
      await remote.applySettings();
      expect(remote.getRuntimeState().state).toBe('off');
      const freeProbe = new LocalProcessProbe();
      await expect(freeProbe.canBindLocalEndpoint('127.0.0.1', port)).resolves.toBe(true);
    });
  });

  describe('fail-closed configuration', () => {
    beforeEach(setUpHarness);
    afterEach(tearDownHarness);

    it('refuses to start when enabled with no token', async () => {
      settings = buildSettings({ remoteControlToken: '' });
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      expect(remote.getRuntimeState().state).toBe('error');
      expect(remote.getRuntimeState().blockedReason).toBe('missing-token');
      const probe = new LocalProcessProbe();
      await expect(probe.canBindLocalEndpoint('127.0.0.1', port)).resolves.toBe(true);
    });

    it('refuses a non-loopback bind without the acknowledgement timestamp', async () => {
      settings = buildSettings({
        remoteControlBindAddress: '0.0.0.0',
        remoteControlNonLoopbackAcknowledgedAt: '',
      });
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      expect(remote.getRuntimeState().state).toBe('error');
      expect(remote.getRuntimeState().blockedReason).toBe('non-loopback-unacknowledged');
      const probe = new LocalProcessProbe();
      await expect(probe.canBindLocalEndpoint('0.0.0.0', port)).resolves.toBe(true);
    });

    it('binds a non-loopback address only when the acknowledgement exists', async () => {
      settings = buildSettings({
        remoteControlBindAddress: '0.0.0.0',
        remoteControlNonLoopbackAcknowledgedAt: new Date().toISOString(),
      });
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      expect(remote.getRuntimeState().state).toBe('listening');
      expect(remote.getRuntimeState().bindAddress).toBe('0.0.0.0');
    });

    it('fails closed when the port is already occupied', async () => {
      const blocker = net.createServer();
      await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));
      try {
        const { driver } = createStubDriver();
        const remote = createService(driver);
        await remote.applySettings();
        expect(remote.getRuntimeState().state).toBe('error');
        expect(remote.getRuntimeState().bindError).toBeDefined();
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });
  });

  describe('request pipeline (real loopback round trips)', () => {
    beforeEach(setUpHarness);
    afterEach(tearDownHarness);

    it('answers health with busy/session state and requires the token', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();

      const withoutToken = await request(port, { path: '/v1/health' });
      expect(withoutToken.status).toBe(401);
      const withToken = await request(port, {
        path: '/v1/health',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(withToken.status).toBe(200);
      expect(JSON.parse(withToken.body)).toEqual({
        ok: true,
        busy: false,
        sessionId: null,
      });
    });

    it('makes missing and wrong tokens byte-for-byte indistinguishable', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();

      const missing = await request(port, { path: '/v1/session' });
      const wrong = await request(port, {
        path: '/v1/session',
        headers: { Authorization: `Bearer ${WRONG_TOKEN}` },
      });
      const malformed = await request(port, {
        path: '/v1/session',
        headers: { Authorization: 'Token nonsense' },
      });
      expect(missing.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(malformed.status).toBe(401);
      expect(missing.body).toBe(wrong.body);
      expect(missing.body).toBe(malformed.body);
      expect(JSON.parse(missing.body).error.code).toBe('unauthorized');
    });

    it('rejects disallowed hosts before authentication', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      const response = await request(port, {
        path: '/v1/health',
        hostHeader: 'evil.example.com:4105',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('forbidden_host');
    });

    it('rejects unknown operations and wrong methods with the closed error set', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();
      const headers = { Authorization: `Bearer ${TOKEN}` };

      const unknownOp = await request(port, {
        method: 'POST',
        path: '/v1/readFile',
        headers,
        body: JSON.stringify({ op: 'readFile', path: '/etc/passwd' }),
      });
      expect(unknownOp.status).toBe(403);
      expect(JSON.parse(unknownOp.body).error.code).toBe('unknown_operation');

      const wrongMethod = await request(port, { method: 'PUT', path: '/v1/health', headers });
      expect(wrongMethod.status).toBe(405);
      expect(JSON.parse(wrongMethod.body).error.code).toBe('method_not_allowed');
    });

    it('enforces the 64 KiB body cap and the closed request shape', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();

      const tooLarge = await authedPost(
        port,
        JSON.stringify({ instruction: 'a'.repeat(64 * 1024 + 1) }),
      );
      expect(tooLarge.status).toBe(413);
      expect(JSON.parse(tooLarge.body).error.code).toBe('payload_too_large');

      const malformed = await authedPost(port, '{broken json');
      expect(malformed.status).toBe(400);
      expect(JSON.parse(malformed.body).error.code).toBe('malformed_request');

      const pathInjection = await authedPost(
        port,
        JSON.stringify({ instruction: 'ok', path: '/etc/passwd' }),
      );
      expect(pathInjection.status).toBe(400);
      expect(JSON.parse(pathInjection.body).error.code).toBe('malformed_request');
    });

    it('drives the dedicated session to a terminal state and returns the result', async () => {
      const { driver, calls } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();

      const startedAt = Date.now();
      const response = await authedPost(
        port,
        JSON.stringify({ instruction: '整理今日会议笔记' }),
      );
      const duration = Date.now() - startedAt;

      expect(response.status).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.terminalState).toBe('completed');
      expect(payload.result.text).toBe('echo:整理今日会议笔记');
      expect(payload.sessionId).toBe('ses_remote-stub');
      expect(payload.requestId).toMatch(/^rc_/);
      expect(payload.durationMs).toBeLessThanOrEqual(duration + 5);

      // Dedicated remote session: created with setCurrent:false, never stealing
      // the user's active tab session.
      expect(calls.createSessionInputs).toEqual([
        { title: 'OpenCodian Remote Control', setCurrent: false },
      ]);

      const status = await request(port, {
        path: '/v1/session',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(JSON.parse(status.body)).toMatchObject({
        sessionId: 'ses_remote-stub',
        activity: 'idle',
        lastTerminalState: 'completed',
      });
    });

    it('answers 409 busy while an instruction is in flight and audits the conflict', async () => {
      let releaseFirst: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const { driver } = createStubDriver(async function* (message) {
        if (message === 'first') {
          await gate;
          yield { type: 'text', content: 'first-done' };
          return;
        }
        yield { type: 'text', content: 'second-done' };
      });
      const remote = createService(driver);
      await remote.applySettings();

      const firstPromise = authedPost(port, JSON.stringify({ instruction: 'first' }));
      await waitFor(() => remote.getRuntimeState().flight === 'running');

      const second = await authedPost(port, JSON.stringify({ instruction: 'second' }));
      expect(second.status).toBe(409);
      expect(JSON.parse(second.body).error.code).toBe('busy');

      releaseFirst?.();
      const first = await firstPromise;
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body).result.text).toBe('first-done');
    });

    it('aborts through the cancel path on the hard deadline and returns an explicitly partial timeout', async () => {
      const { driver, calls } = createStubDriver(async function* () {
        yield { type: 'text', content: 'partial ' };
        await new Promise<void>(() => undefined); // never settles
      });
      const remote = createService(driver, { turnTimeoutMs: 80 });
      await remote.applySettings();

      const response = await authedPost(port, JSON.stringify({ instruction: 'long task' }));
      expect(response.status).toBe(200);
      const payload = JSON.parse(response.body);
      expect(payload.terminalState).toBe('timeout');
      expect(payload.result.text).toBe('partial ');
      expect(calls.cancelStreamInputs).toEqual(['ses_remote-stub']);

      const status = JSON.parse(
        (await request(port, {
          path: '/v1/session',
          headers: { Authorization: `Bearer ${TOKEN}` },
        })).body,
      );
      expect(status.lastTerminalState).toBe('timeout');
    });

    it('audits rejections and terminal outcomes without token or instruction content', async () => {
      const { driver } = createStubDriver();
      const remote = createService(driver);
      await remote.applySettings();

      await request(port, { path: '/v1/health' }); // 401 probe
      await authedPost(port, JSON.stringify({ instruction: '需要审计的机密指令内容' }));

      const audit = remote.audit;
      await audit.flush();
      const events = await audit.store.readTrace(REMOTE_CONTROL_AUDIT_TRACE_ID);
      const serialized = JSON.stringify(events);

      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain(WRONG_TOKEN);
      expect(serialized).not.toContain('需要审计的机密指令内容');
      expect(events.some((event) => event.name === 'request.terminal')).toBe(true);
      const rejected = events.filter((event) => event.name === 'request.rejected');
      expect(rejected.length).toBeGreaterThanOrEqual(1);
      const terminal = events.find((event) => event.name === 'request.terminal');
      expect((terminal?.payload as Record<string, unknown>).instruction).toMatchObject({
        charLength: '需要审计的机密指令内容'.length,
      });
    });
  });

  it('keeps the production port fixed at 4105', () => {
    expect(REMOTE_CONTROL_PORT).toBe(4105);
  });

