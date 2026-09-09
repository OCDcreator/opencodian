import * as path from 'node:path';

import { resolvePiCommand } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';

const mockFiles = new Map<string, string>();
const mockRealpaths = new Map<string, string>();
jest.mock('node:path', () => jest.requireActual<typeof path>('node:path').win32);
jest.mock('node:os', () => ({ homedir: () => 'C:\\Users\\lt' }));
jest.mock('node:fs', () => ({
  existsSync: (file: string) => mockFiles.has(file),
  realpathSync: (file: string) => mockRealpaths.get(file) ?? file,
  readFileSync: (file: string) => { const value = mockFiles.get(file); if (value === undefined) throw new Error('ENOENT'); return value; },
}));

const npmDirectory = 'C:\\Users\\lt\\AppData\\Roaming\\npm';
const nodeDirectory = 'C:\\Program Files\\nodejs';
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const originalEnv = process.env;

function install(scope: string, bundled: boolean, shim = 'pi.cmd'): string {
  const root = path.join(npmDirectory, 'node_modules', scope, 'pi-coding-agent');
  const entry = bundled ? 'dist/bundle/cli.js' : 'dist/cli.js';
  mockFiles.set(path.join(root, 'package.json'), JSON.stringify({ name: `${scope}/pi-coding-agent`, bin: { pi: entry } }));
  for (const file of ['dist/cli.js', 'dist/index.js', entry]) mockFiles.set(path.join(root, file), '');
  mockFiles.set(path.join(npmDirectory, shim), `@echo off\r\n"%_prog%" "%dp0%\\node_modules\\${scope}\\pi-coding-agent\\${entry.replace(/\//g, '\\')}" %*\r\n`);
  return root;
}

describe('Pi official Windows installation resolution', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env = { PATH: `${npmDirectory};${nodeDirectory}`, APPDATA: 'C:\\Users\\lt\\AppData\\Roaming', ProgramFiles: 'C:\\Program Files' };
    mockFiles.clear(); mockRealpaths.clear();
    mockFiles.set(path.join(nodeDirectory, 'node.exe'), '');
  });
  afterEach(() => { Object.defineProperty(process, 'platform', originalPlatform); process.env = originalEnv; });

  it.each([['@mariozechner', false], ['@earendil-works', true]] as const)('resolves %s using the shim target and canonical SDK directory', (scope, bundled) => {
    const root = install(scope, bundled);
    expect(resolvePiCommand(path.join(npmDirectory, 'pi.cmd'))).toEqual({ command: path.join(nodeDirectory, 'node.exe'), prefix: [path.join(root, 'dist/cli.js')] });
  });

  it('follows the active renamed package when both packages are installed', () => {
    install('@mariozechner', false);
    const root = install('@earendil-works', true);
    expect(resolvePiCommand('')).toEqual({ command: path.join(nodeDirectory, 'node.exe'), prefix: [path.join(root, 'dist/cli.js')] });
  });

  it.each(['pi', 'pi.cmd', 'pi.ps1'])('accepts command name %s', command => {
    const root = install('@earendil-works', true);
    install('@earendil-works', true, 'pi.ps1');
    expect(resolvePiCommand(command).prefix).toEqual([path.join(root, 'dist/cli.js')]);
  });

  it('accepts the quoted absolute bundled entry while keeping SDK imports outside bundle/', () => {
    const root = install('@earendil-works', true);
    expect(resolvePiCommand(`"${path.join(root, 'dist/bundle/cli.js')}"`).prefix).toEqual([path.join(root, 'dist/cli.js')]);
  });

  it('finds standard Node even when the GUI PATH is stale', () => {
    install('@earendil-works', true); process.env.PATH = 'C:\\Windows\\System32';
    expect(resolvePiCommand('').command).toBe(path.join(nodeDirectory, 'node.exe'));
  });

  it('does not substitute an old package for a broken active shim', () => {
    install('@mariozechner', false);
    const root = install('@earendil-works', true); mockFiles.delete(path.join(root, 'package.json'));
    expect(() => resolvePiCommand('')).toThrow(/official Pi package/);
  });

  it('rejects unrelated packages even when their entry is named cli.js', () => {
    const root = install('@unrelated', true);
    expect(() => resolvePiCommand(path.join(root, 'dist/bundle/cli.js'))).toThrow(/official Pi package/);
  });

  it('reports missing SDK files distinctly from missing CLI', () => {
    const root = install('@earendil-works', true); mockFiles.delete(path.join(root, 'dist/index.js'));
    expect(() => resolvePiCommand('')).toThrow(/SDK entry is missing/);
  });
});
