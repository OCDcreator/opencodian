import childProcess, { type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

import {
  DshAcpClient,
  type DshAcpClientOptions,
  resolveDshLaunch,
  validateDshMcpServers,
} from '../../../../../src/core/agents/backend/dsh/DshAcpClient';

const HANDSHAKE = {
  protocolVersion: 1,
  agentInfo: { name: 'deepseek-harness-acp', version: '0.0.1' },
  agentCapabilities: { sessionCapabilities: { list: {}, resume: {}, close: {} } },
  authMethods: [],
};

describe('DSH ACP MCP admission', () => {
  it('preserves exact stdio and HTTP declaration values and rejects unsafe or duplicate declarations', () => {
    const local = { name: 'local', command: path.resolve('node'), args: ['--stdio'], env: [{ name: 'TOKEN', value: ' exact ' }] };
    const http = { type: 'http', name: 'remote', url: 'https://example.test/mcp', headers: [{ name: 'Authorization', value: 'Bearer fixture' }] };
    expect(validateDshMcpServers([local, http])).toEqual([local, http]);
    expect(() => validateDshMcpServers([local, local])).toThrow('Duplicate');
    expect(() => validateDshMcpServers([{ ...local, command: 'relative-node' }])).toThrow('absolute');
    expect(() => validateDshMcpServers([{ ...http, url: 'file:///private/config' }])).toThrow('HTTP(S)');
    expect(() => validateDshMcpServers([{ ...http, headers: [{ name: 'Authorization', value: 'first\r\nInjected: x' }] }])).toThrow('Invalid');
    expect(() => validateDshMcpServers([{ ...local, env: [{ name: 'bad-key', value: 'x' }] }])).toThrow('Invalid');
    expect(() => validateDshMcpServers([{ ...http, type: 'sse' }])).toThrow('Unsupported');
  });
});

describe('DSH ACP structured prompts', () => {
  it('sends the exact MCP and content-block arrays through the native wire methods', async () => {
    const client = clientFor(`(message, {respond}) => {
      if (message.method === 'session/new') respond(message, {sessionId:'wire', received:message.params.mcpServers});
      else if (message.method === 'session/prompt') respond(message, {received:message.params.prompt});
      else if (message.method === 'session/close') respond(message, {});
    }`);
    try {
      await client.start();
      expect(client.handshake).toEqual(HANDSHAKE);
      const mcp = [{ name: 'local', command: path.resolve('node'), args: [], env: [] }];
      await expect(client.newSession(process.cwd(), mcp)).resolves.toMatchObject({ received: mcp });
      const prompt = [{ type: 'text', text: 'look' }, { type: 'image', mimeType: 'image/png', data: 'YQ==' },
        { type: 'resource_link', name: 'note', uri: 'file:///vault/note.md' }];
      await expect(client.prompt('wire', prompt)).resolves.toEqual({ received: prompt });
    } finally { await client.stop(); }
    expect(client.handshake).toBeNull();
  });
});

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

/** Child script that emits benign diagnostics plus a synthetic bearer/JWT pair. */
function redactionProbeScript(jwt: string): string {
  return [
    'process.stderr.write("/Users/dht/Projects/DeepSeekHarness/runtime failed to start\\n");',
    'process.stderr.write("auth failed: bearer synthetic_access_token_123456\\n");',
    `process.stderr.write("token ${jwt}\\n");`,
    'process.stderr.write("build zcode-dsh-gap-remediation.202610251749 done\\n");',
    'process.exit(4);',
  ].join('');
}

function clientFor(handler: string, options: Partial<DshAcpClientOptions> = {}): DshAcpClient {
  return new DshAcpClient({
    cwd: process.cwd(),
    launch: { command: process.execPath, args: ['-e', fixtureScript(handler)], env: {} },
    // A real Node child needs startup headroom on shared Windows CI runners.
    // Timeout-specific cases keep their explicit shorter budgets below.
    requestTimeoutMs: 2_000,
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
    const cliPath = path.join('/tools', 'dsh');
    const desktopExecutable = path.join('/Applications/DeepSeek Harness.app', 'Contents', 'MacOS', 'DeepSeek Harness');
    expect(resolveDshLaunch(base, { PATH: ['/tools', '/other'].join(path.delimiter) }, {
      platform: 'darwin', homedir: '/home/test', isExecutable: (candidate) => candidate === cliPath,
    }).command).toBe(cliPath);
    const desktop = resolveDshLaunch(base, { PATH: '/none' }, {
      platform: 'darwin', homedir: '/home/test',
      isExecutable: (candidate) => candidate === desktopExecutable,
    });
    expect(desktop).toMatchObject({
      command: desktopExecutable,
      env: { PATH: '/none', ELECTRON_RUN_AS_NODE: '1' },
    });
    expect(desktop.args[0]).toBe(path.join('/Applications/DeepSeek Harness.app', 'Contents', 'Resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'));
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

  it('contains stdin EPIPE while the child remains alive', async () => {
    const spawn = jest.spyOn(childProcess, 'spawn');
    const protocolErrors: Error[] = [];
    // A dedicated script that logs on stderr at startup (the shared fixture
    // only invokes its handler for non-initialize messages).
    const script = `
process.stdin.setEncoding('utf8');
process.stderr.write('dsh flush failed\\n');
process.stdin.on('data', (chunk) => {
  for (const line of chunk.split('\\n')) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: ${JSON.stringify(HANDSHAKE)} }) + '\\n');
    }
  }
});
`;
    const client = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', script], env: {} },
      requestTimeoutMs: 250,
      onProtocolError: (error) => protocolErrors.push(error),
    });
    try {
      await client.start();
      const child = spawn.mock.results[0].value as ChildProcessWithoutNullStreams;
      expect(child.exitCode).toBeNull();
      for (let attempt = 0; attempt < 50 && !client.recentStderr; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const pending = client.listSessions();
      // Exercise the real stdin error listener without OS-specific fd0 close semantics.
      child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
      await expect(pending).rejects.toThrow(/EPIPE|stdin|transport/i);
      // The stderr-tail wrap mutates the message in place, so code survives
      // alongside the diagnostic suffix.
      expect(protocolErrors).toEqual([expect.objectContaining({ code: 'EPIPE' })]);
      expect(protocolErrors[0].message).toContain('DSH stderr tail');
      expect(client.isStarted).toBe(false);
    } finally {
      await client.stop();
      spawn.mockRestore();
    }
  });
});

describe('DshAcpClient lifecycle and server requests', () => {
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

describe('DSH ACP prompt liveness and stderr diagnostics', () => {
  it('re-arms the prompt idle-gap timeout while the session keeps streaming updates', async () => {
    // Four updates 70ms apart end after 280ms; without activity refresh the
    // 200ms prompt deadline would fire before the turn can settle.
    const client = clientFor(`(message, io) => {
      if (message.method === 'session/prompt') {
        let ticks = 0;
        const timer = setInterval(() => {
          io.send({ jsonrpc: '2.0', method: 'session/update', params: {
            sessionId: message.params.sessionId, update: { sessionUpdate: 'agent_message_chunk' }
          } });
          if (++ticks >= 4) { clearInterval(timer); io.respond(message, { stopReason: 'end_turn' }); }
        }, 70);
      }
    }`, { requestTimeoutMs: 250, promptTimeoutMs: 200 });
    try {
      await client.start();
      await expect(client.prompt('live', 'hello')).resolves.toEqual({ stopReason: 'end_turn' });
    } finally {
      await client.stop();
    }
  });

  it('still times out a prompt turn that streams nothing', async () => {
    const client = clientFor('(message) => { /* never answers prompts */ }', {
      requestTimeoutMs: 250, promptTimeoutMs: 120,
    });
    await client.start();
    await expect(client.prompt('silent', 'hello')).rejects.toThrow('session/prompt timed out');
    await client.stop();
  });

  it('attaches a secret-redacted stderr tail to transport failure errors', async () => {
    const failures: Error[] = [];
    const client = new DshAcpClient({
      cwd: process.cwd(),
      launch: {
        command: process.execPath,
        args: ['-e', 'process.stderr.write("dsh boot failure sk-abcdefghijklmnopqrstuvwx\\n"); process.exit(3);'],
        env: {},
      },
      requestTimeoutMs: 300,
      onProtocolError: (error) => { failures.push(error); },
    });
    await expect(client.start()).rejects.toThrow('process exited');
    const message = failures.map((error) => error.message).join('\n');
    expect(message).toContain('DSH stderr tail');
    expect(message).toContain('[redacted]');
    expect(message).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(client.recentStderr).toContain('[redacted]');
  });

  it('carries the redacted tail in the startup rejection and redacts any-case bearer and short-header JWTs', async () => {
    const failures: Error[] = [];
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const client = new DshAcpClient({
      cwd: process.cwd(),
      launch: { command: process.execPath, args: ['-e', redactionProbeScript(jwt)], env: {} },
      requestTimeoutMs: 300,
      onProtocolError: (error) => { failures.push(error); },
    });
    // The initialize rejection is what startup callers actually see; it must
    // carry the diagnostic tail, not only the onProtocolError callback.
    const rejection = await client.start().catch((error: Error) => error.message);
    expect(rejection).toContain('DSH stderr tail');
    expect(rejection).not.toContain('synthetic_access_token');
    expect(rejection).not.toContain(jwt);
    const callbackMessage = failures.map((error) => error.message).join('\n');
    expect(callbackMessage).not.toContain('synthetic_access_token');
    expect(callbackMessage).not.toContain(jwt);
    // Dotted identifiers (versions, BUILD_IDs) must stay readable diagnostics.
    expect(rejection).toContain('zcode-dsh-gap-remediation.202610251749');
    // A leading path is a common benign diagnostic, not a truncated key.
    expect(rejection).toContain('/Users/dht/Projects/DeepSeekHarness/runtime failed to start');
    expect(client.recentStderr).toContain('[redacted]');
  });
});
