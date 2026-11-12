import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { accessSync, statSync } from 'node:fs';
import { PassThrough } from 'node:stream';

import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/opencode/OpenCode2Adapter';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs', () => ({ ...jest.requireActual('node:fs'), accessSync: jest.fn(), statSync: jest.fn() }));

const spawnMock = spawn as jest.Mock;
const accessMock = accessSync as jest.Mock;
const statMock = statSync as jest.Mock;
const originalEnvironment = process.env;
const originalPlatform = process.platform;

function localAdapter(executablePath = '', extraEnv?: Record<string, string>): OpenCode2Adapter {
  return new OpenCode2Adapter({ workingDirectory: '/vault',
    getSettings: () => ({ mode: 'local', executablePath, baseUrl: '', password: '', configContent: '{"extension":true}' }), extraEnv });
}

function admitFiles(...files: string[]): void {
  accessMock.mockImplementation((candidate: string) => { if (!files.includes(candidate)) throw new Error('ENOENT'); });
  statMock.mockImplementation((candidate: string) => { if (!files.includes(candidate)) throw new Error('ENOENT'); return { isFile: () => true }; });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { HOME: '/home/person', PATH: '/usr/bin:/bin' };
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  admitFiles();
  spawnMock.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), exitCode: 1, kill: jest.fn() });
    queueMicrotask(() => child.emit('error', new Error('launch probe stop')));
    return child;
  });
});
afterEach(() => { process.env = originalEnvironment; Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true }); });

describe('OpenCode 2 local executable discovery', () => {
  it('launches a registered native install with the minimal macOS GUI PATH', async () => {
    admitFiles('/home/person/.opencode/bin/opencode2');
    await expect(localAdapter().start()).rejects.toThrow('launch probe stop');
    expect(spawnMock).toHaveBeenCalledWith('/home/person/.opencode/bin/opencode2', expect.arrayContaining(['serve', '--stdio']), expect.objectContaining({
      cwd: '/vault', env: expect.objectContaining({ PATH: expect.stringContaining('/home/person/.opencode/bin'), OPENCODE_CONFIG_CONTENT: '{"extension":true}' }),
    }));
    expect(process.env.PATH).toBe('/usr/bin:/bin');
  });

  it('prefers an opencode2 already registered on the inherited PATH', async () => {
    process.env.PATH = '/tools/bin:/usr/bin';
    admitFiles('/tools/bin/opencode2', '/home/person/.opencode/bin/opencode2');
    await expect(localAdapter().start()).rejects.toThrow('launch probe stop');
    expect(spawnMock.mock.calls[0][0]).toBe('/tools/bin/opencode2');
  });

  it('preserves an explicit executable and expands its home prefix', async () => {
    admitFiles('/home/person/.opencode/bin/opencode2');
    await expect(localAdapter('~/custom/opencode2').start()).rejects.toThrow('launch probe stop');
    expect(spawnMock.mock.calls[0][0]).toBe('/home/person/custom/opencode2');
  });

  it('retains auxiliary environment isolation while discovering the host installation', async () => {
    admitFiles('/home/person/.opencode/bin/opencode2');
    await expect(localAdapter('', { HOME: '/isolated', XDG_CONFIG_HOME: '/isolated/config', PATH: '/aux/bin' }).start()).rejects.toThrow('launch probe stop');
    expect(spawnMock.mock.calls[0][0]).toBe('/home/person/.opencode/bin/opencode2');
    expect(spawnMock.mock.calls[0][2].env).toEqual(expect.objectContaining({ HOME: '/isolated', XDG_CONFIG_HOME: '/isolated/config', PATH: expect.stringMatching(/^\/aux\/bin:/) }));
  });

  it('does not silently launch the retired opencode executable', async () => {
    admitFiles('/usr/bin/opencode', '/home/person/.opencode/bin/opencode');
    await expect(localAdapter().start()).rejects.toThrow(/OpenCode 2.*not found/i);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('finds the native npm binary on Windows without invoking a shell shim', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env = { USERPROFILE: 'C:\\Users\\Person', APPDATA: 'C:\\Users\\Person\\AppData\\Roaming', Path: 'C:\\Windows\\System32' };
    const executable = 'C:\\Users\\Person\\AppData\\Roaming\\npm\\node_modules\\@opencode\\cli\\bin\\opencode.exe';
    admitFiles(executable);
    await expect(localAdapter().start()).rejects.toThrow('launch probe stop');
    expect(spawnMock.mock.calls[0][0]).toBe(executable);
    expect(spawnMock.mock.calls[0][2].shell).not.toBe(true);
    expect(spawnMock.mock.calls[0][2].env.Path).toBeUndefined();
    expect(spawnMock.mock.calls[0][2].env.PATH).toContain('C:\\Windows\\System32;');
  });
});
