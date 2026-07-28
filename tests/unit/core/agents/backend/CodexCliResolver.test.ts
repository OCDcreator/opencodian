import { resolveCodexCli } from '../../../../../src/core/agents/backend/CodexCliResolver';

describe('CodexCliResolver', () => {
  it('prefers a valid configured path over the GUI-visible PATH', () => {
    const resolution = resolveCodexCli({
      executablePath: '/custom/codex',
      platform: 'darwin',
      env: { PATH: '/usr/local/bin' },
      existsSync: (candidate) => candidate === '/custom/codex' || candidate === '/usr/local/bin/codex',
    });

    expect(resolution).toEqual({
      mode: 'available',
      executablePath: '/custom/codex',
      source: 'configured',
    });
  });

  it('does not fall back to PATH when the configured path is invalid', () => {
    const checked: string[] = [];
    const resolution = resolveCodexCli({
      executablePath: '/missing/codex',
      platform: 'darwin',
      env: { PATH: '/usr/local/bin' },
      existsSync: (candidate) => {
        checked.push(candidate);
        return candidate === '/usr/local/bin/codex';
      },
    });

    expect(resolution).toEqual({
      mode: 'missing',
      reason: 'configured-path-not-found',
      configuredPath: '/missing/codex',
    });
    expect(checked).toEqual(['/missing/codex']);
  });

  it('discovers a regular Codex executable from the GUI-visible PATH', () => {
    const resolution = resolveCodexCli({
      executablePath: '',
      platform: 'darwin',
      env: { PATH: '/usr/bin:/gui/bin' },
      existsSync: (candidate) => candidate === '/gui/bin/codex',
    });

    expect(resolution).toEqual({
      mode: 'available',
      executablePath: '/gui/bin/codex',
      source: 'path',
    });
  });

  it('uses a native codex.exe found on Windows PATH', () => {
    const resolution = resolveCodexCli({
      executablePath: '',
      platform: 'win32',
      arch: 'x64',
      env: { Path: 'C:\\Tools\\Codex;C:\\Windows\\System32' },
      existsSync: (candidate) => candidate === 'C:\\Tools\\Codex\\codex.exe',
    });

    expect(resolution).toEqual({
      mode: 'available',
      executablePath: 'C:\\Tools\\Codex\\codex.exe',
      source: 'path',
    });
  });

  it('resolves the native Windows executable next to an npm codex.cmd shim', () => {
    const npmBin = 'C:\\Users\\test\\AppData\\Roaming\\npm';
    const packageJson = `${npmBin}\\node_modules\\@openai\\codex\\package.json`;
    const nativeExecutable = `${npmBin}\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
    const resolution = resolveCodexCli({
      executablePath: '',
      platform: 'win32',
      arch: 'x64',
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming', Path: 'C:\\Windows\\System32' },
      existsSync: (candidate) => [
        `${npmBin}\\codex.cmd`,
        packageJson,
        nativeExecutable,
      ].includes(candidate),
    });

    expect(resolution).toEqual({
      mode: 'available',
      executablePath: nativeExecutable,
      source: 'windows-npm-shim',
    });
  });

  it('reports a missing user CLI without probing a plugin-private runtime path', () => {
    const checked: string[] = [];
    const resolution = resolveCodexCli({
      executablePath: '',
      platform: 'darwin',
      env: { PATH: '/usr/bin', HOME: '/Users/test' },
      existsSync: (candidate) => {
        checked.push(candidate);
        return false;
      },
    });

    expect(resolution).toEqual({ mode: 'missing', reason: 'cli-not-on-path' });
    expect(checked.some((candidate) => candidate.includes('/plugins/opencodian/node_modules/'))).toBe(false);
  });
});
