/**
 * ZCodeRuntimeResolver.test.ts — cross-platform runtime discovery.
 *
 * Covers the official CLI/app-server shapes (native binary and the
 * `electron-node` bundle), every discovery source, and the actionable
 * diagnostics required when the runtime is absent or incompatible.
 */
import { describe, expect, it } from '@jest/globals';

import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';
import {
  getZCodeRuntimeErrorMessage,
  resolveOfficialZCodeDesktopBundle,
  resolveZCodeRuntime,
} from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

/** Narrow a failed resolution for message assertions (throws on unexpected ready). */
function asFailure(resolution: ZCodeRuntimeResolution): Extract<ZCodeRuntimeResolution, { mode: 'missing' | 'incompatible' }> {
  if (resolution.mode === 'ready') {
    throw new Error(`expected a failed resolution, got ready via ${resolution.launch.entryPath}`);
  }
  return resolution;
}

/** Deterministic fake filesystem: only listed absolute paths exist. */
function fakeExists(existing: readonly string[]) {
  const set = new Set(existing.map((entry) => entry.replace(/\\/g, '/')));
  return (candidate: string) => set.has(candidate.replace(/\\/g, '/'));
}

const baseOptions = {
  homedir: '/home/tester',
  env: {} as Record<string, string | undefined>,
  existsSync: fakeExists([]),
};

describe('resolveOfficialZCodeDesktopBundle — desktop task index companion', () => {
  it('locates the installed desktop bundle independently of an active local CLI override', () => {
    const official = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
    expect(resolveOfficialZCodeDesktopBundle({
      ...baseOptions,
      platform: 'darwin',
      existsSync: fakeExists([official, '/custom/zcode.cjs']),
    })).toBe(official);
  });

  it('returns null when no official desktop installation exists', () => {
    expect(resolveOfficialZCodeDesktopBundle({ ...baseOptions, platform: 'win32' })).toBeNull();
  });
});

describe('resolveZCodeRuntime — settings override', () => {
  it('uses a configured native binary with the official spawn args', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      executablePath: '/opt/zcode-agent',
      existsSync: fakeExists(['/opt/zcode-agent']),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'native-binary',
        command: '/opt/zcode-agent',
        args: ['app-server', '--stdio'],
        entryPath: '/opt/zcode-agent',
        source: 'configured',
        extraEnv: {},
      },
    });
  });

  it('runs a configured zcode.cjs bundle under its own app Electron runtime', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'darwin',
      executablePath: '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
      existsSync: fakeExists([
        '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
        '/Applications/ZCode.app/Contents/MacOS/ZCode',
      ]),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'node-bundle',
        command: '/Applications/ZCode.app/Contents/MacOS/ZCode',
        args: [
          '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
          'app-server',
          '--stdio',
        ],
        entryPath: '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
        source: 'configured',
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
      },
    });
  });

  it('falls back to node when no Electron host is available for a bundle', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'linux',
      executablePath: '/opt/glm/zcode.cjs',
      existsSync: fakeExists(['/opt/glm/zcode.cjs']),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'node-bundle',
        command: 'node',
        args: ['/opt/glm/zcode.cjs', 'app-server', '--stdio'],
        entryPath: '/opt/glm/zcode.cjs',
        source: 'configured',
        extraEnv: {},
      },
    });
  });

  it('prefers the native binary over the bundle inside a configured directory', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'darwin',
      executablePath: '/opt/glm',
      existsSync: fakeExists(['/opt/glm', '/opt/glm/zcode-agent', '/opt/glm/zcode.cjs']),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'native-binary',
        command: '/opt/glm/zcode-agent',
        args: ['app-server', '--stdio'],
        entryPath: '/opt/glm/zcode-agent',
        source: 'configured',
        extraEnv: {},
      },
    });
  });

  it('reports an actionable missing state for a bad configured path', () => {
    const resolution = asFailure(resolveZCodeRuntime({
      ...baseOptions,
      executablePath: '/nope/zcode-agent',
      existsSync: fakeExists([]),
    }));
    expect(resolution).toEqual({
      mode: 'missing',
      reason: 'configured-path-not-found',
      configuredPath: '/nope/zcode-agent',
      searched: ['/nope/zcode-agent'],
    });
    expect(getZCodeRuntimeErrorMessage(resolution)).toContain('/nope/zcode-agent');
  });

  it('expands a leading home segment in the configured path', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'darwin',
      executablePath: '~/tools/zcode-agent',
      existsSync: fakeExists(['/home/tester/tools/zcode-agent']),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'native-binary',
        command: '/home/tester/tools/zcode-agent',
        args: ['app-server', '--stdio'],
        entryPath: '/home/tester/tools/zcode-agent',
        source: 'configured',
        extraEnv: {},
      },
    });
  });
});

describe('resolveZCodeRuntime — official environment contracts', () => {
  it('honors the ZCODE_AGENT_SERVER_COMMAND override with custom args', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      env: {
        ZCODE_AGENT_SERVER_COMMAND: '/opt/custom/agent',
        ZCODE_AGENT_SERVER_ARGS_JSON: '["serve"]',
      },
      existsSync: fakeExists([]),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'native-binary',
        command: '/opt/custom/agent',
        args: ['serve'],
        entryPath: '/opt/custom/agent',
        source: 'agent-server-command',
        extraEnv: {},
      },
    });
  });

  it('prefers the settings override over the environment command override', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      executablePath: '/opt/from-settings',
      env: { ZCODE_AGENT_SERVER_COMMAND: '/opt/from-env' },
      existsSync: fakeExists(['/opt/from-settings']),
    })).toMatchObject({
      mode: 'ready',
      launch: { command: '/opt/from-settings', source: 'configured' },
    });
  });

  it('defaults the command override args to app-server --stdio', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      env: { ZCODE_AGENT_SERVER_COMMAND: '/opt/custom/agent' },
      existsSync: fakeExists([]),
    })).toMatchObject({
      mode: 'ready',
      launch: { command: '/opt/custom/agent', args: ['app-server', '--stdio'] },
    });
  });

  it('fails honestly on malformed ZCODE_AGENT_SERVER_ARGS_JSON', () => {
    const resolution = asFailure(resolveZCodeRuntime({
      ...baseOptions,
      env: {
        ZCODE_AGENT_SERVER_COMMAND: '/opt/custom/agent',
        ZCODE_AGENT_SERVER_ARGS_JSON: 'not-json',
      },
      existsSync: fakeExists([]),
    }));
    expect(resolution.mode).toBe('incompatible');
    expect(getZCodeRuntimeErrorMessage(resolution)).toContain('ZCODE_AGENT_SERVER_ARGS_JSON');
  });

  it('resolves a deployed native binary via GLM_BINARY_PATH', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'win32',
      env: { GLM_BINARY_PATH: 'C:\\glm\\zcode-agent.exe' },
      existsSync: fakeExists(['C:/glm/zcode-agent.exe']),
    })).toMatchObject({
      mode: 'ready',
      launch: { entryKind: 'native-binary', source: 'glm-binary-path' },
    });
  });

  it('resolves a node bundle from ZCODE_AGENT_WORKDIR', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'linux',
      env: { ZCODE_AGENT_WORKDIR: '/opt/agent-workdir' },
      existsSync: fakeExists(['/opt/agent-workdir', '/opt/agent-workdir/zcode.cjs']),
    })).toMatchObject({
      mode: 'ready',
      launch: { entryKind: 'node-bundle', source: 'agent-workdir', entryPath: '/opt/agent-workdir/zcode.cjs' },
    });
  });
});

describe('resolveZCodeRuntime — app-bundled discovery per platform', () => {
  it('finds the macOS app bundle node runtime and its Electron host binary', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'darwin',
      existsSync: fakeExists([
        '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
        '/Applications/ZCode.app/Contents/MacOS/ZCode',
      ]),
    })).toEqual({
      mode: 'ready',
      launch: {
        entryKind: 'node-bundle',
        command: '/Applications/ZCode.app/Contents/MacOS/ZCode',
        args: ['/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs', 'app-server', '--stdio'],
        entryPath: '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
        source: 'app-bundled',
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
      },
    });
  });

  it('finds the Windows install layout with zcode-agent.exe preferred', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' },
      existsSync: fakeExists([
        'C:/Users/tester/AppData/Local/Programs/ZCode/resources/glm/zcode-agent.exe',
        'C:/Users/tester/AppData/Local/Programs/ZCode/resources/glm/zcode.cjs',
      ]),
    })).toMatchObject({
      mode: 'ready',
      launch: {
        entryKind: 'native-binary',
        source: 'app-bundled',
        entryPath: 'C:\\Users\\tester\\AppData\\Local\\Programs\\ZCode\\resources\\glm\\zcode-agent.exe',
      },
    });
  });

  it('finds the Linux install layout bundle and runs it under the app Electron binary', () => {
    expect(resolveZCodeRuntime({
      ...baseOptions,
      platform: 'linux',
      existsSync: fakeExists([
        '/opt/ZCode/resources/glm/zcode.cjs',
        '/opt/ZCode/ZCode',
      ]),
    })).toMatchObject({
      mode: 'ready',
      launch: {
        command: '/opt/ZCode/ZCode',
        args: ['/opt/ZCode/resources/glm/zcode.cjs', 'app-server', '--stdio'],
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
      },
    });
  });

  it('reports an actionable unavailable state when nothing is installed', () => {
    const resolution = asFailure(resolveZCodeRuntime({ ...baseOptions, platform: 'linux', existsSync: fakeExists([]) }));
    expect(resolution.mode).toBe('missing');
    expect(resolution.searched.length).toBeGreaterThan(0);
    const message = getZCodeRuntimeErrorMessage(resolution);
    expect(message).toContain('ZCode runtime was not found');
    expect(message).toContain('ZCODE_AGENT_WORKDIR');
  });
});
