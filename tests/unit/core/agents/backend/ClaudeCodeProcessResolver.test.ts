import { resolveClaudeCodeProcess } from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

describe('ClaudeCodeProcessResolver', () => {
  it('uses the SDK bundled executable path by default while augmenting PATH', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: () => false,
    });

    expect(resolution.mode).toBe('sdk-bundled');
    expect(resolution.pathToClaudeCodeExecutable).toBeUndefined();
    expect(resolution.env.PATH).toContain('/usr/bin');
    expect(resolution.env.PATH).toContain('/opt/homebrew/bin');
    expect(resolution.env.PATH).toContain('/Users/test/.claude/local');
    expect(resolution.diagnostics.pathAugmented).toBe(true);
  });

  it('resolves an absolute configured executable path', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: '~/bin/claude',
      },
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: (candidate) => candidate === '/Users/test/bin/claude',
    });

    expect(resolution.mode).toBe('external');
    expect(resolution.pathToClaudeCodeExecutable).toBe('/Users/test/bin/claude');
    expect(resolution.shell).toBe(false);
    expect(resolution.diagnostics.configuredPath).toBe('~/bin/claude');
  });

  it('falls back to SDK bundled mode when a configured executable does not exist', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: '/missing/claude',
      },
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: () => false,
    });

    expect(resolution.mode).toBe('sdk-bundled');
    expect(resolution.pathToClaudeCodeExecutable).toBeUndefined();
    expect(resolution.diagnostics.configuredPath).toBe('/missing/claude');
    expect(resolution.diagnostics.resolvedExternalPath).toBeNull();
  });

  it('resolves a Windows command from augmented PATH and uses shell for cmd files', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        executablePath: 'claude',
      },
      platform: 'win32',
      env: {
        Path: 'C:\\Windows\\System32',
        APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\test',
      },
      existsSync: (candidate) => candidate === 'C:\\Users\\test\\AppData\\Roaming/npm/claude.cmd',
    });

    expect(resolution.mode).toBe('external');
    expect(resolution.pathToClaudeCodeExecutable).toBe('C:\\Users\\test\\AppData\\Roaming/npm/claude.cmd');
    expect(resolution.shell).toBe(true);
  });
});
