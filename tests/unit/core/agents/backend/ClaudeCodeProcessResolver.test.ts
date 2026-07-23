import { resolveClaudeCodeProcess } from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

describe('ClaudeCodeProcessResolver', () => {
  it('discovers the external Claude CLI from the augmented PATH by default', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: (candidate) => candidate === '/Users/test/.claude/local/claude',
    });

    expect(resolution.mode).toBe('external');
    expect(resolution.pathToClaudeCodeExecutable).toBe('/Users/test/.claude/local/claude');
    expect(resolution.env.PATH).toContain('/usr/bin');
    expect(resolution.env.PATH).toContain('/opt/homebrew/bin');
    expect(resolution.env.PATH).toContain('/Users/test/.claude/local');
    expect(resolution.diagnostics.pathAugmented).toBe(true);
  });

  it('reports a missing external Claude CLI instead of falling back to a bundled SDK binary', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: () => false,
    });

    expect(resolution.mode).toBe('missing');
    expect(resolution.pathToClaudeCodeExecutable).toBeUndefined();
    expect(resolution.diagnostics.configuredPath).toBeNull();
    expect(resolution.diagnostics.resolvedExternalPath).toBeNull();
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

  it('reports a missing executable when a configured path does not exist', () => {
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

    expect(resolution.mode).toBe('missing');
    expect(resolution.pathToClaudeCodeExecutable).toBeUndefined();
    expect(resolution.diagnostics.configuredPath).toBe('/missing/claude');
    expect(resolution.diagnostics.resolvedExternalPath).toBeNull();
  });

  it('resolves the default Windows npm wrapper from augmented PATH and uses shell for cmd files', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
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

  it('discovers the Claude CLI from ~/.local/bin fallback on macOS', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/test',
      },
      existsSync: (candidate) => candidate === '/Users/test/.local/bin/claude',
    });

    expect(resolution.mode).toBe('external');
    expect(resolution.pathToClaudeCodeExecutable).toBe('/Users/test/.local/bin/claude');
    expect(resolution.env.PATH).toContain('/Users/test/.local/bin');
    expect(resolution.diagnostics.pathAugmented).toBe(true);
  });

  it('reports cli-not-on-path reason when no CLI is configured or discovered', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: { PATH: '/usr/bin', HOME: '/Users/test' },
      existsSync: () => false,
    });

    expect(resolution.mode).toBe('missing');
    expect(resolution.diagnostics.reason).toBe('cli-not-on-path');
    expect(resolution.diagnostics.configuredPath).toBeNull();
  });

  it('reports configured-path-not-found reason when a configured path is missing', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: { ...getDefaultClaudeCodeBackendSettings(), executablePath: '/missing/claude' },
      platform: 'darwin',
      env: { PATH: '/usr/bin', HOME: '/Users/test' },
      existsSync: () => false,
    });

    expect(resolution.mode).toBe('missing');
    expect(resolution.diagnostics.reason).toBe('configured-path-not-found');
  });

  it('omits reason when the CLI resolves successfully', () => {
    const resolution = resolveClaudeCodeProcess({
      settings: getDefaultClaudeCodeBackendSettings(),
      platform: 'darwin',
      env: { PATH: '/usr/bin', HOME: '/Users/test' },
      existsSync: (candidate) => candidate === '/Users/test/.claude/local/claude',
    });

    expect(resolution.mode).toBe('external');
    expect(resolution.diagnostics.reason).toBeUndefined();
  });
});
