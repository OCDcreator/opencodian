import { describe, expect, it, jest } from '@jest/globals';

import {
  DshAcpClient,
  type DshAcpClientOptions,
  resolveDshLaunch,
} from '../../../../../src/core/agents/backend/dsh/DshAcpClient';

const HANDSHAKE = {
  protocolVersion: 1,
  agentInfo: { name: 'deepseek-harness-acp', version: '0.0.1' },
  agentCapabilities: { sessionCapabilities: { list: {}, resume: {}, close: {} } },
  authMethods: [],
};

function fixtureScript(handler: string): string {
  return `
process.stdin.setEncoding('utf8');
let input = '';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const respond = (message, result) => send({ jsonrpc: '2.0', id: message.id, result });
const handshake = ${JSON.stringify(HANDSHAKE)};
let state = Object.create(null);
process.stdin.on('data', (chunk) => {
  input += chunk;
  for (;;) {
    const newline = input.indexOf('\\n');
    if (newline < 0) break;
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') { respond(message, handshake); continue; }
    (${handler})(message, { send, respond, state });
  }
});
`;
}

function clientFor(handler: string, options: Partial<DshAcpClientOptions> = {}): DshAcpClient {
  return new DshAcpClient({
    cwd: process.cwd(),
    launch: { command: process.execPath, args: ['-e', fixtureScript(handler)], env: {} },
    requestTimeoutMs: 250,
    promptTimeoutMs: 500,
    ...options,
  });
}

function handshakeClient(result: unknown, delayMs = 0): DshAcpClient {
  const script = `
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
  const newline = input.indexOf('\\n');
  if (newline < 0) return;
  const request = JSON.parse(input.slice(0, newline));
  setTimeout(() => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: ${JSON.stringify(result)} }) + '\\n'), ${delayMs});
});
`;
  return new DshAcpClient({
    cwd: process.cwd(),
    launch: { command: process.execPath, args: ['-e', script], env: {} },
    requestTimeoutMs: 300,
  });
}

describe('resolveDshLaunch', () => {
  it('gives an explicit CLI precedence and pins ACP after exact user arguments', () => {
    expect(resolveDshLaunch({
      executablePath: '/opt/dsh', workingDirectory: '', args: ['--verbose'],
      env: { TOKEN: '  exact  ' }, profile: 'acp',
    }, { SHARED: '1' })).toEqual({
      command: '/opt/dsh',
      args: ['--profile', 'acp', '--verbose'],
      env: { SHARED: '1', TOKEN: '  exact  ' },
    });
  });

  it('uses PATH by default and rejects profile or mode overrides', () => {
    expect(resolveDshLaunch(
      { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp' },
      { PATH: '/none' },
      { platform: 'darwin', homedir: '/home/test', isExecutable: () => false },
    ))
      .toMatchObject({ command: 'dsh', args: ['--profile', 'acp'] });
    expect(() => resolveDshLaunch({ executablePath: '', workingDirectory: '', args: ['--profile=other'], env: {}, profile: 'acp' }))
      .toThrow('cannot override');
    expect(() => resolveDshLaunch({ executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'desktop' }))
      .toThrow('ACP profile');
  });

  it('does not silently fall back when an explicit Desktop bundle is missing', () => {
    expect(() => resolveDshLaunch({
      executablePath: '/definitely/missing/DeepSeek Harness.app', workingDirectory: '', args: [], env: {}, profile: 'acp',
    }, {}, { isExecutable: () => false })).toThrow('Desktop executable was not found');
  });

  it('prefers the configured PATH CLI before deterministic Desktop fallback', () => {
    const base = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp' } as const;
    expect(resolveDshLaunch(base, { PATH: '/tools:/other' }, {
      platform: 'darwin', homedir: '/home/test', isExecutable: (candidate) => candidate === '/tools/dsh',
    }).command).toBe('/tools/dsh');
    const desktop = resolveDshLaunch(base, { PATH: '/none' }, {
      platform: 'darwin', homedir: '/home/test',
      isExecutable: (candidate) => candidate === '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
    });
    expect(desktop).toMatchObject({
      command: '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
      env: { PATH: '/none', ELECTRON_RUN_AS_NODE: '1' },
    });
    expect(desktop.args[0]).toContain('DeepSeek Harness.app/Contents/Resources/app.asar/dsh/');
  });

  it('accepts only a native Windows executable and rejects command shims', () => {
    const base = { executablePath: '', workingDirectory: '', args: [], env: {}, profile: 'acp' } as const;
    expect(resolveDshLaunch(base, { PATH: 'C:\\tools' }, {
      platform: 'win32', isExecutable: (candidate) => candidate.endsWith('dsh.exe'),
    }).command).toMatch(/dsh\.exe$/);
    expect(() => resolveDshLaunch({ ...base, executablePath: 'C:\\tools\\dsh.cmd' }))
      .toThrow('command shims are unsupported');
    expect(() => resolveDshLaunch(base, { PATH: '' }, { platform: 'win32', isExecutable: () => false }))
      .toThrow('native dsh.exe was not found');
  });
});

describe('DshAcpClient transport', () => {
  it('correlates out-of-order responses and preserves split UTF-8 frames', async () => {
    const client = clientFor(`(message, io) => {
      if (message.method !== 'session/list') return;
      io.state.requests = io.state.requests || [];
      io.state.requests.push(message);
      if (io.state.requests.length !== 2) return;
      const [first, second] = io.state.requests;
      io.respond(second, { sessions: [{ sessionId: 'second', title: 'later' }] });
      const frame = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: first.id, result: { sessions: [{ sessionId: 'first', title: '你好' }] } }) + '\\n');
      const split = frame.indexOf(Buffer.from('你')) + 1;
      process.stdout.write(frame.subarray(0, split));
      setTimeout(() => process.stdout.write(frame.subarray(split)), 5);
    }`);
    await client.start();
    const [first, second] = await Promise.all([client.listSessions('/one'), client.listSessions('/two')]);
    expect(first.sessions).toEqual([{ sessionId: 'first', title: '你好' }]);
    expect(second.sessions).toEqual([{ sessionId: 'second', title: 'later' }]);
    await client.stop();
  });

  it.each([
    ['null', 'null'],
    ['scalar', '42'],
    ['array', '[]'],
    ['malformed', '{broken'],
  ])('rejects a %s protocol frame without hanging', async (_label, frame) => {
    const script = `process.stdin.once('data', () => process.stdout.write(${JSON.stringify(`${frame}\n`)}));`;
    const client = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', script], env: {} },
      requestTimeoutMs: 250,
    });
    await expect(client.start()).rejects.toThrow(/JSON-RPC|malformed JSON/);
    await client.stop();
  });

  it('validates the initialize protocol version and result shape', async () => {
    const badVersion = handshakeClient({
      protocolVersion: 2, agentInfo: { name: 'x', version: '1' }, agentCapabilities: {}, authMethods: []
    });
    await expect(badVersion.start()).rejects.toThrow('protocol version mismatch');

    const badInfo = handshakeClient({
      protocolVersion: 1, agentInfo: null, agentCapabilities: {}, authMethods: []
    });
    await expect(badInfo.start()).rejects.toThrow('invalid agentInfo');
  });

  it('rejects bounded-buffer overflow, request timeout, and early process exit', async () => {
    const overflowScript = `process.stdin.once('data', () => process.stdout.write('x'.repeat(128)));`;
    const overflow = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', overflowScript], env: {} },
      requestTimeoutMs: 250,
      maxStdoutBufferBytes: 64,
    });
    await expect(overflow.start()).rejects.toThrow('buffer limit');

    const timeout = clientFor(`() => {}`);
    await timeout.start();
    await expect(timeout.listSessions()).rejects.toThrow('timed out');
    await timeout.stop();

    const exitScript = `process.stdin.once('data', () => process.exit(7));`;
    const exited = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', exitScript], env: {} },
      requestTimeoutMs: 500,
    });
    await expect(exited.start()).rejects.toThrow('process exited');
  });

  it('contains stdin EPIPE when the child closes fd0 but remains alive', async () => {
    const script = `
const fs = require('node:fs');
process.stdin.setEncoding('utf8');
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
  const newline = input.indexOf('\\n');
  if (newline < 0) return;
  const request = JSON.parse(input.slice(0, newline));
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: ${JSON.stringify(HANDSHAKE)} }) + '\\n');
  setTimeout(() => fs.closeSync(0), 5);
});
setInterval(() => {}, 1000);
`;
    const protocolErrors: Error[] = [];
    const client = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', script], env: {} },
      requestTimeoutMs: 250,
      onProtocolError: (error) => protocolErrors.push(error),
    });
    await client.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(client.listSessions()).rejects.toThrow(/EPIPE|stdin|transport/i);
    expect(protocolErrors).toEqual([expect.objectContaining({ code: 'EPIPE' })]);
    expect(client.isStarted).toBe(false);
    await client.stop();
  });

  it('can stop an in-flight start and then start a fresh process', async () => {
    const client = handshakeClient(HANDSHAKE, 50);
    const firstStart = client.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.stop();
    await expect(firstStart).rejects.toThrow();
    await client.start();
    expect(client.isStarted).toBe(true);
    await client.stop();
  });

  it('returns method-not-found for unknown server requests', async () => {
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/list') {
        io.state.list = message;
        io.send({ jsonrpc: '2.0', id: 91, method: 'unknown/request', params: {} });
        return;
      }
      if (message.id === 91) io.send({ jsonrpc: '2.0', id: io.state.list.id, error: message.error });
    }`);
    await client.start();
    await expect(client.listSessions()).rejects.toThrow('Unsupported DSH ACP request');
    await client.stop();
  });

  it('rejects an invalid permission handler reply on the wire', async () => {
    const handler = jest.fn(async () => ({ outcome: { outcome: 'selected', optionId: 'not-offered' } })) as never;
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/list') {
        io.state.list = message;
        io.send({ jsonrpc: '2.0', id: 44, method: 'session/request_permission', params: {
          sessionId: 's1', toolCall: { name: 'shell' },
          options: [{ optionId: 'reject', kind: 'reject_once' }]
        } });
        return;
      }
      if (message.id === 44) io.send({ jsonrpc: '2.0', id: io.state.list.id, error: message.error });
    }`, { onPermissionRequest: handler });
    await client.start();
    await expect(client.listSessions()).rejects.toThrow('invalid response');
    expect(handler).toHaveBeenCalledTimes(1);
    await client.stop();
  });

  it('never writes a late permission response into a restarted child', async () => {
    let resolvePermission!: (value: { outcome: { outcome: 'cancelled' } }) => void;
    const permission = new Promise<{ outcome: { outcome: 'cancelled' } }>((resolve) => { resolvePermission = resolve; });
    const onPermissionRequest = jest.fn(() => permission);
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/list') {
        io.state.list = message;
        io.send({ jsonrpc: '2.0', id: 44, method: 'session/request_permission', params: {
          sessionId: 's1', toolCall: { name: 'shell' }, options: [{ optionId: 'reject', kind: 'reject_once' }]
        } });
        return;
      }
      if (message.id === 44) {
        io.state.leaked = true;
        if (io.state.list) io.respond(io.state.list, { sessions: [] });
        return;
      }
      if (message.method === 'session/new') return io.respond(message, { sessionId: io.state.leaked ? 'leaked' : 'clean' });
      if (message.method === 'session/close') return io.respond(message, null);
    }`, { onPermissionRequest });
    await client.start();
    const abandonedList = client.listSessions().catch(() => null);
    while (onPermissionRequest.mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    await client.stop();
    await abandonedList;
    await client.start();
    resolvePermission({ outcome: { outcome: 'cancelled' } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(client.newSession(process.cwd())).resolves.toMatchObject({ sessionId: 'clean' });
    await client.stop();
  });

  it('closes only sessions activated by this client during teardown', async () => {
    const updates: string[] = [];
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/new') return io.respond(message, { sessionId: 'owned' });
      if (message.method === 'session/list') return io.respond(message, { sessions: [{ sessionId: 'listed-only' }] });
      if (message.method === 'session/close') {
        io.send({ jsonrpc: '2.0', method: 'session/update', params: {
          sessionId: message.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'closed' } }
        } });
        return io.respond(message, null);
      }
    }`, { onUpdate: (update) => updates.push(update.sessionId) });
    await client.start();
    await client.newSession(process.cwd());
    await client.listSessions();
    await client.stop();
    expect(updates).toEqual(['owned']);
  });

  it('surfaces session close failure after cleaning up the owned process', async () => {
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/new') return io.respond(message, { sessionId: 'owned' });
      if (message.method === 'session/close') return io.send({
        jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'flush failed' }
      });
    }`);
    await client.start();
    await client.newSession(process.cwd());
    await expect(client.stop()).rejects.toThrow('flush failed');
    expect(client.isStarted).toBe(false);
  });
});
