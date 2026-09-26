/**
 * ZCodeRuntimeResolver.hostBinaryRegression.test.ts — regression cover for
 * Electron host-binary derivation from a node-bundle entry.
 *
 * The macOS layout nests the bundle at `<App>.app/Contents/Resources/glm/`,
 * so the host binary lives two levels above `Resources` at
 * `<App>.app/Contents/MacOS/<App>`. The Windows/Linux layout keeps the
 * bundle at `<install>/resources/glm/` with the host binary in `<install>`.
 */
import { describe, expect, it } from '@jest/globals';

import { resolveZCodeRuntime } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

describe('ZCodeRuntimeResolver — host binary derivation regression', () => {
  it('derives the macOS host binary from ZCode.app, not from Contents', () => {
    const existing = [
      '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
      '/Applications/ZCode.app/Contents/MacOS/ZCode',
    ];
    const probed: string[] = [];
    const resolution = resolveZCodeRuntime({
      homedir: '/home/tester',
      env: {},
      platform: 'darwin',
      isElectronHost: false,
      existsSync: (candidate) => {
        probed.push(candidate);
        return existing.includes(candidate);
      },
    });
    expect(probed).toContain('/Applications/ZCode.app/Contents/MacOS/ZCode');
    expect(probed).not.toContain('/Applications/ZCode.app/Contents/Contents/MacOS/Contents');
    expect(resolution).toEqual({
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

  it('derives the Windows host binary from the install root next to resources', () => {
    const existing = [
      'C:/Users/tester/AppData/Local/Programs/ZCode/resources/glm/zcode.cjs',
      'C:/Users/tester/AppData/Local/Programs/ZCode/ZCode.exe',
    ];
    const resolution = resolveZCodeRuntime({
      homedir: 'C:\\Users\\tester',
      env: { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' },
      platform: 'win32',
      isElectronHost: false,
      existsSync: (candidate) => existing.includes(candidate.replace(/\\/g, '/')),
    });
    expect(resolution).toMatchObject({
      mode: 'ready',
      launch: {
        entryKind: 'node-bundle',
        command: 'C:\\Users\\tester\\AppData\\Local\\Programs\\ZCode\\ZCode.exe',
        extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
      },
    });
  });

  it('keeps the node fallback when no host binary exists anywhere', () => {
    const resolution = resolveZCodeRuntime({
      homedir: '/home/tester',
      env: {},
      platform: 'darwin',
      isElectronHost: false,
      existsSync: (candidate) => candidate === '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
    });
    expect(resolution).toMatchObject({
      mode: 'ready',
      launch: { command: 'node', extraEnv: {} },
    });
  });
});
