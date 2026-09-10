import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { PiRpcClient, resolvePiCommand } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));
jest.mock('node:fs', () => {
  const nativePath = jest.requireActual<typeof import('node:path')>('node:path');
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const files = ['/bin/pi', `/bin/${nodeName}`, '/pkg/dist/cli.js', '/pkg/dist/index.js', '/plugin/assets/pi/service.mjs']
    .map((file) => nativePath.resolve(file));
  return {
    existsSync: (file: string) => files.includes(file),
    realpathSync: () => nativePath.resolve('/pkg/dist/cli.js'),
    readFileSync: (file: string) => {
      if (file !== nativePath.resolve('/pkg/package.json')) throw new Error('ENOENT');
      return '{"name":"@mariozechner/pi-coding-agent","bin":{"pi":"dist/cli.js"}}';
    },
  };
});

describe('Pi RPC process boundary', () => {
  let process: EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: jest.Mock; exitCode: number | null };
  let client: PiRpcClient;
  let commands: Record<string, unknown>[];

  beforeEach(() => {
    jest.useFakeTimers();
    commands = [];
    process = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(), exitCode: null });
    process.kill.mockImplementation(() => { process.exitCode = 0; process.emit('exit', 0, null); return true; });
    process.stdin.on('data', (buffer: Buffer) => commands.push(JSON.parse(buffer.toString())));
    mockSpawn.mockReturnValue(process);
    client = new PiRpcClient({ workingDirectory: '/vault with spaces', executablePath: path.resolve('/bin/pi'), sessionDirectory: '/sessions', servicePath: path.resolve('/plugin/assets/pi/service.mjs') });
  });

  afterEach(() => { client?.close(); jest.useRealTimers(); });

  it('uses an external Node process with shell disabled and keeps arguments separate', () => {
    const nodePath = path.resolve('/bin', globalThis.process.platform === 'win32' ? 'node.exe' : 'node');
    expect(resolvePiCommand(path.resolve('/bin/pi'))).toEqual({ command: nodePath, prefix: [path.resolve('/pkg/dist/cli.js')] });
    expect(mockSpawn).toHaveBeenLastCalledWith(nodePath, [path.resolve('/plugin/assets/pi/service.mjs'), path.resolve('/pkg/dist/index.js'), expect.any(String)], expect.objectContaining({ shell: false, cwd: '/vault with spaces' }));
  });

  it('correlates concurrent responses and preserves UTF-8 and Unicode line separators', async () => {
    const events: unknown[] = [];
    client.subscribe((event) => events.push(event));
    const state = client.request({ type: 'get_state' });
    const models = client.request({ type: 'get_available_models' });
    process.stdout.write(`${JSON.stringify({ type: 'response', id: commands[1].id, command: 'get_available_models', success: true, data: { models: [] } })}\r\n`);
    const unicode = Buffer.from(`${JSON.stringify({ type: 'notify', text: '中文\u2028inside\u2029string' })}\n`);
    process.stdout.write(unicode.subarray(0, 28));
    process.stdout.write(unicode.subarray(28));
    process.stdout.write(`${JSON.stringify({ type: 'response', id: commands[0].id, command: 'get_state', success: true, data: { isStreaming: false } })}\n`);
    await expect(models).resolves.toEqual({ models: [] });
    await expect(state).resolves.toEqual({ isStreaming: false });
    expect(events).toEqual([{ type: 'notify', text: '中文\u2028inside\u2029string' }]);
  });

  it('forwards extension dialogs and sends only the explicit host response', () => {
    const events: unknown[] = []; client.subscribe((event) => events.push(event));
    process.stdout.write('{"type":"extension_ui_request","id":"dialog-1","method":"confirm"}\n');
    expect(commands).toEqual([]); expect(events).toContainEqual(expect.objectContaining({ method: 'confirm' }));
    client.respond({ id: 'dialog-1', confirmed: true });
    expect(commands).toContainEqual({ type: 'extension_ui_response', id: 'dialog-1', confirmed: true });
  });

  it('rejects timed out requests, terminates the child, and ignores late responses', async () => {
    const pending = client.request({ type: 'get_state' }, 50).catch((error) => error);
    jest.advanceTimersByTime(51);
    expect((await pending).message).toContain('timed out');
    expect(commands).toContainEqual({ type: 'shutdown' });
    await expect(client.request({ type: 'get_state' })).rejects.toThrow('closed');
  });

  it('rejects outstanding requests on process death and contains malformed JSON', async () => {
    const pending = client.request({ type: 'get_state' }).catch((error) => error);
    process.stdout.write('not-json\n');
    expect((await pending).message).toContain('invalid JSONL');
    expect(commands).toContainEqual({ type: 'shutdown' });
  });

  it('checks response command identity', async () => {
    const pending = client.request({ type: 'get_state' });
    process.stdout.write(`${JSON.stringify({ type: 'response', id: commands[0].id, command: 'prompt', success: true })}\n`);
    await expect(pending).rejects.toThrow('invalid response');
  });
});
