/**
 * ServerManager binary resolution unit tests
 */

import * as fs from 'fs';
import * as path from 'path';

import { LocalSidecarLauncher } from '../../../../src/core/opencode/LocalSidecarLauncher';
import { ServerManager } from '../../../../src/core/opencode/ServerManager';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn(), removeListener: jest.fn() },
    stderr: { on: jest.fn(), removeListener: jest.fn() },
    killed: false,
  }),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null }),
}));

jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

const { spawn: mockSpawn } = jest.requireMock('child_process') as {
  spawn: jest.Mock;
};

type ServerManagerTestAccess = ServerManager & {
  localSidecarLauncher: LocalSidecarLauncher;
};

type LocalSidecarLauncherTestAccess = LocalSidecarLauncher & {
  getSpawnEnv(): NodeJS.ProcessEnv;
  findOpenCodeBinary(): string | null;
};

const defaultConfig = {
  mode: 'local' as const,
  baseUrl: 'http://127.0.0.1:4196',
  local: {
    host: '127.0.0.1',
    port: 4196,
    autoStart: true,
  },
  auth: {
    type: 'none' as const,
    username: 'opencode',
    password: '',
    token: '',
  },
  modelSourceMode: 'merge' as const,
  pluginIsolationMode: 'default' as const,
};

function mockProcessPlatform(platform: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(process, 'platform', descriptor);
    }
  };
}

type ServerManagerContext = {
  defaultConfig: typeof defaultConfig;
  getManager(): ServerManager;
  getLauncherTestAccess(): LocalSidecarLauncherTestAccess;
  setManager(nextManager: ServerManager): ServerManager;
  testVaultPath: string;
};

function getLocalSidecarLauncher(manager: ServerManager): LocalSidecarLauncher {
  return (manager as unknown as ServerManagerTestAccess).localSidecarLauncher;
}

function registerBinaryResolutionTests(context: ServerManagerContext): void {
  describe('binary resolution', () => {
    if (process.platform === 'win32') {
      it('prefers npm global opencode.cmd over PATH opencode.exe', () => {
        const npmBinDir = path.join(context.testVaultPath, 'AppData', 'npm');
        const pathBinDir = path.join(context.testVaultPath, 'WinGetLinks');
        const npmBinary = path.join(npmBinDir, 'opencode.cmd');
        const pathBinary = path.join(pathBinDir, 'opencode.exe');

        fs.mkdirSync(npmBinDir, { recursive: true });
        fs.mkdirSync(pathBinDir, { recursive: true });
        fs.writeFileSync(npmBinary, '@echo off', 'utf-8');
        fs.writeFileSync(pathBinary, '', 'utf-8');

        process.env.APPDATA = path.join(context.testVaultPath, 'AppData');
        process.env.LOCALAPPDATA = path.join(context.testVaultPath, 'LocalAppData');
        process.env.PATH = pathBinDir;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(npmBinary);
      });
    }

    it('resolves Windows OpenCode Desktop opencode-cli.exe when npm shims are absent', () => {
      const restorePlatform = mockProcessPlatform('win32');
      const localAppData = path.join(context.testVaultPath, 'LocalAppData');
      const desktopBinary = path.join(localAppData, 'OpenCode', 'opencode-cli.exe');

      try {
        fs.mkdirSync(path.dirname(desktopBinary), { recursive: true });
        fs.writeFileSync(desktopBinary, '', 'utf-8');

        delete process.env.APPDATA;
        process.env.LOCALAPPDATA = localAppData;
        process.env.PATH = '';
        delete process.env.Path;
        delete process.env.path;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(desktopBinary);
      } finally {
        restorePlatform();
      }
    });

    it('resolves Windows user bin opencode.cmd when npm shims are absent', () => {
      const restorePlatform = mockProcessPlatform('win32');
      const userProfile = path.join(context.testVaultPath, 'UserProfile');
      const userBinBinary = path.join(userProfile, 'bin', 'opencode.cmd');

      try {
        fs.mkdirSync(path.dirname(userBinBinary), { recursive: true });
        fs.writeFileSync(userBinBinary, '@echo off', 'utf-8');

        delete process.env.APPDATA;
        delete process.env.LOCALAPPDATA;
        process.env.USERPROFILE = userProfile;
        process.env.PATH = '';
        delete process.env.Path;
        delete process.env.path;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(userBinBinary);
      } finally {
        restorePlatform();
      }
    });

    it('resolves Windows PATH fallback from process.env.Path when PATH is absent', () => {
      const restorePlatform = mockProcessPlatform('win32');
      const pathBinDir = path.join(context.testVaultPath, 'ExplorerPathBin');
      const binaryPath = path.join(pathBinDir, 'opencode.cmd');

      try {
        fs.mkdirSync(pathBinDir, { recursive: true });
        fs.writeFileSync(binaryPath, '@echo off', 'utf-8');

        delete process.env.APPDATA;
        delete process.env.LOCALAPPDATA;
        delete process.env.USERPROFILE;
        delete process.env.PATH;
        process.env.Path = pathBinDir;
        delete process.env.path;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(binaryPath);
      } finally {
        restorePlatform();
      }
    });

    it('resolves Windows PATH fallback from process.env.Path when PATH is empty', () => {
      const restorePlatform = mockProcessPlatform('win32');
      const pathBinDir = path.join(context.testVaultPath, 'ExplorerEmptyPathBin');
      const binaryPath = path.join(pathBinDir, 'opencode.cmd');

      try {
        fs.mkdirSync(pathBinDir, { recursive: true });
        fs.writeFileSync(binaryPath, '@echo off', 'utf-8');

        delete process.env.APPDATA;
        delete process.env.LOCALAPPDATA;
        delete process.env.USERPROFILE;
        process.env.PATH = '';
        process.env.Path = pathBinDir;
        delete process.env.path;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(binaryPath);
      } finally {
        restorePlatform();
      }
    });

    it('prefers the configured OpenCode executable path before platform defaults', () => {
      const customBinDir = path.join(context.testVaultPath, 'CustomBin');
      const pathBinDir = path.join(context.testVaultPath, 'PathBin');
      const customBinary = path.join(customBinDir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
      const pathBinary = path.join(pathBinDir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');

      fs.mkdirSync(customBinDir, { recursive: true });
      fs.mkdirSync(pathBinDir, { recursive: true });
      fs.writeFileSync(customBinary, process.platform === 'win32' ? '@echo off' : '#!/bin/sh', 'utf-8');
      fs.writeFileSync(pathBinary, process.platform === 'win32' ? '@echo off' : '#!/bin/sh', 'utf-8');
      process.env.PATH = pathBinDir;

      context.setManager(new ServerManager({
        ...context.defaultConfig,
        local: {
          ...context.defaultConfig.local,
          executablePath: customBinary,
        } as typeof context.defaultConfig.local & { executablePath: string },
      }));

      const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

      expect(resolved).toBe(customBinary);
    });

    it('resolves the macOS official installer path when PATH is empty', () => {
      const restorePlatform = mockProcessPlatform('darwin');
      const homeDir = path.join(context.testVaultPath, 'Home');
      const officialBinary = path.join(homeDir, '.opencode', 'bin', 'opencode');

      try {
        fs.mkdirSync(path.dirname(officialBinary), { recursive: true });
        fs.writeFileSync(officialBinary, '#!/bin/sh', 'utf-8');

        process.env.HOME = homeDir;
        process.env.PATH = '';
        delete process.env.Path;
        delete process.env.path;

        const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

        expect(resolved).toBe(officialBinary);
      } finally {
        restorePlatform();
      }
    });

    it('resolves the first matching binary from PATH', () => {
      const pathBinDir = path.join(context.testVaultPath, 'PathBin');
      const binaryName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const binaryPath = path.join(pathBinDir, binaryName);

      fs.mkdirSync(pathBinDir, { recursive: true });
      fs.writeFileSync(binaryPath, process.platform === 'win32' ? '@echo off' : '#!/bin/sh', 'utf-8');

      delete process.env.APPDATA;
      delete process.env.LOCALAPPDATA;
      process.env.HOME = path.join(context.testVaultPath, 'HomeWithoutOfficialInstall');
      process.env.PATH = pathBinDir;

      const resolved = context.getLauncherTestAccess().findOpenCodeBinary();

      expect(resolved).toBe(binaryPath);
    });

    if (process.platform === 'win32') {
      it('spawns npm opencode.cmd through the shell', async () => {
        const npmBinDir = path.join(context.testVaultPath, 'AppData', 'npm');
        const npmBinary = path.join(npmBinDir, 'opencode.cmd');

        fs.mkdirSync(npmBinDir, { recursive: true });
        fs.writeFileSync(npmBinary, '@echo off', 'utf-8');
        process.env.APPDATA = path.join(context.testVaultPath, 'AppData');
        process.env.LOCALAPPDATA = path.join(context.testVaultPath, 'LocalAppData');
        process.env.PATH = '';

        await getLocalSidecarLauncher(context.getManager()).launchRuntime({
          timeout: 30000,
          checkHealth: async () => true,
          managedServerStateSnapshot: null,
        });

        expect(mockSpawn).toHaveBeenCalledWith(
          npmBinary,
          expect.any(Array),
          expect.objectContaining({
            shell: true,
            windowsHide: true,
          }),
        );
      });
    }
  });
}

describe('ServerManager binary resolution', () => {
  let manager: ServerManager;
  const testVaultPath = path.join(__dirname, 'server-manager-binary-vault');
  const originalEnv = { ...process.env };
  const getManager = (): ServerManager => manager;
  const setManager = (nextManager: ServerManager): ServerManager => {
    manager = nextManager;
    return manager;
  };
  const getLauncherTestAccess = (): LocalSidecarLauncherTestAccess => (
    getLocalSidecarLauncher(manager) as LocalSidecarLauncherTestAccess
  );

  beforeEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
    manager = new ServerManager(defaultConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(testVaultPath)) {
      fs.rmSync(testVaultPath, { recursive: true, force: true });
    }
  });

  const context: ServerManagerContext = {
    defaultConfig,
    getManager,
    getLauncherTestAccess,
    setManager,
    testVaultPath,
  };

  registerBinaryResolutionTests(context);
});
