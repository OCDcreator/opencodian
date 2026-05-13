/**
 * ServerManager lifecycle and environment unit tests
 */

import * as fs from 'fs';
import * as path from 'path';

import { LocalSidecarLauncher } from '../../../../src/core/opencode/LocalSidecarLauncher';
import { LocalProcessProbe } from '../../../../src/core/opencode/LocalSidecarProcessInspector';
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

const { requestUrl: mockRequestUrl } = jest.requireMock('obsidian') as {
  Notice: jest.Mock;
  requestUrl: jest.Mock;
};
function getProcessProbe(manager: ServerManager): LocalProcessProbe {
  return (manager as unknown as { processProbe: LocalProcessProbe }).processProbe;
}

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

function registerStateAndHealthTests(context: ServerManagerContext): void {
  describe('constructor', () => {
    it('should create manager with default config', () => {
      const manager = context.getManager();

      expect(manager).toBeDefined();
      expect(manager.getStatus()).toBe('stopped');
      expect(manager.isRunning()).toBe(false);
    });

    it('should create manager with custom config', () => {
      const customManager = new ServerManager({
        ...context.defaultConfig,
        baseUrl: 'http://0.0.0.0:5000',
        local: {
          host: '0.0.0.0',
          port: 5000,
          autoStart: true,
        },
        timeout: 60000,
      });

      expect(customManager).toBeDefined();
    });
  });

  describe('status management', () => {
    it('should return stopped status initially', () => {
      expect(context.getManager().getStatus()).toBe('stopped');
    });

    it('should report not running initially', () => {
      expect(context.getManager().isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should handle stop when not running', async () => {
      await expect(context.getManager().stop()).resolves.not.toThrow();
    });

    it('routes child-process teardown through the shutdown lifecycle seam', async () => {
      const manager = context.getManager();
      const managedProcess = { pid: 2468 } as unknown;
      (manager as unknown as { process: unknown; status: string }).process = managedProcess;
      (manager as unknown as { status: string }).status = 'running';
      const terminateManagedProcess = jest.spyOn(manager as never, 'terminateManagedProcess').mockResolvedValue(undefined);
      jest.spyOn(getProcessProbe(manager), 'waitForPortAvailability').mockResolvedValue(true);

      await expect(manager.stop()).resolves.toBeUndefined();

      expect(terminateManagedProcess).toHaveBeenCalledWith(managedProcess);
      expect(manager.getStatus()).toBe('stopped');
    });

    it('terminates an adopted pid and clears managed state during stop', async () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 1357,
            host: '127.0.0.1',
            port: 4196,
          },
        },
      ));
      (manager as unknown as { status: string }).status = 'running';
      const terminateManagedPid = jest.spyOn(getProcessProbe(manager), 'terminateManagedPid').mockResolvedValue(undefined);
      jest.spyOn(getProcessProbe(manager), 'waitForPortAvailability').mockResolvedValue(true);

      await expect(manager.stop()).resolves.toBeUndefined();

      expect(terminateManagedPid).toHaveBeenCalledWith(1357);
      expect(manager.getManagedServerStateSnapshot()).toBeNull();
      expect(manager.getStatus()).toBe('stopped');
    });

    it('dispose uses the live plugin listener pid for legacy single-pid state', () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 20976,
            host: '127.0.0.1',
            port: 4196,
          },
        },
      ));
      jest.spyOn(getProcessProbe(manager), 'getCurrentPluginManagedListenerPidSync').mockReturnValue(23332);
      const terminateManagedPidSync = jest.spyOn(getProcessProbe(manager), 'terminateManagedPidSync').mockImplementation(() => {});

      manager.dispose();

      expect(terminateManagedPidSync).toHaveBeenCalledWith(23332);
      expect(terminateManagedPidSync).toHaveBeenCalledWith(20976);
    });
  });

  describe('restart', () => {
    it('should be defined', () => {
      expect(typeof context.getManager().restart).toBe('function');
    });
  });

  describe('checkHealth', () => {
    it('should return true for healthy server', async () => {
      mockRequestUrl.mockResolvedValueOnce({ status: 200 });

      const result = await context.getManager().checkHealth();

      expect(result).toBe(true);
      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:4196/global/health',
        method: 'GET',
      }));
    });

    it('should return false for unhealthy server', async () => {
      mockRequestUrl.mockResolvedValueOnce({ status: 500 });

      const result = await context.getManager().checkHealth();

      expect(result).toBe(false);
    });

    it('should return false on fetch error', async () => {
      mockRequestUrl.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await context.getManager().checkHealth();

      expect(result).toBe(false);
    });

    it('should respect timeout', async () => {
      mockRequestUrl.mockImplementation(() => new Promise(() => {}));

      const startTime = Date.now();
      const result = await context.getManager().checkHealth(100);
      const elapsed = Date.now() - startTime;

      expect(result).toBe(false);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('event handlers', () => {
    it('should accept event handlers in constructor', () => {
      const onStatusChange = jest.fn();
      const onError = jest.fn();
      const managerWithEvents = new ServerManager(context.defaultConfig, { onStatusChange, onError });

      expect(managerWithEvents).toBeDefined();
    });
  });
}

function registerEnvironmentAndBinaryTests(context: ServerManagerContext): void {
  describe('server model source mode', () => {
    it('keeps project config enabled so project skills and tools are discoverable', () => {
      context.setManager(new ServerManager({
        ...context.defaultConfig,
        modelSourceMode: 'server',
      }));

      context.getManager().setWorkingDirectory(context.testVaultPath);
      const env = context.getLauncherTestAccess().getSpawnEnv();

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    });
  });

  describe('local-only model source mode', () => {
    it('should not inject a provider whitelist into the managed server env', () => {
      context.setManager(new ServerManager({
        ...context.defaultConfig,
        modelSourceMode: 'local',
      }));
      fs.mkdirSync(path.join(context.testVaultPath, '.opencode'), { recursive: true });
      fs.writeFileSync(
        path.join(context.testVaultPath, '.opencode', 'opencode.json'),
        JSON.stringify({ $schema: 'https://opencode.ai/config.json' }),
        'utf-8',
      );

      context.getManager().setWorkingDirectory(context.testVaultPath);
      const env = context.getLauncherTestAccess().getSpawnEnv();

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    });

    it('should ignore local enabled_providers and disabled_providers when preparing server env', () => {
      context.setManager(new ServerManager({
        ...context.defaultConfig,
        modelSourceMode: 'local',
      }));
      fs.mkdirSync(path.join(context.testVaultPath, '.opencode'), { recursive: true });
      fs.writeFileSync(
        path.join(context.testVaultPath, '.opencode', 'opencode.json'),
        JSON.stringify({
          $schema: 'https://opencode.ai/config.json',
          provider: {
            openai: { name: 'OpenAI', models: {} },
            anthropic: { name: 'Anthropic', models: {} },
            ollama: { name: 'Ollama', models: {} },
          },
          enabled_providers: ['openai', 'anthropic'],
          disabled_providers: ['anthropic'],
        }),
        'utf-8',
      );

      context.getManager().setWorkingDirectory(context.testVaultPath);
      const env = context.getLauncherTestAccess().getSpawnEnv();

      expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(env.OPENCODE_CONFIG_DIR).toBeUndefined();
      expect(env.OPENCODE_CONFIG_CONTENT).toBeUndefined();
    });

    it('should strip inherited config override env but preserve plugin and skill runtime flags', () => {
      process.env.OPENCODE_CONFIG = 'C:\\temp\\custom-opencode.json';
      process.env.OPENCODE_TUI_CONFIG = 'C:\\temp\\tui.json';
      process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = 'true';
      process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS = 'true';
      process.env.OPENCODE_PURE = 'true';
      process.env.OPENCODE_PERMISSION = '{"edit":"deny"}';

      context.setManager(new ServerManager({
        ...context.defaultConfig,
        modelSourceMode: 'local',
      }));

      const env = context.getLauncherTestAccess().getSpawnEnv();

      expect(env.OPENCODE_CONFIG).toBeUndefined();
      expect(env.OPENCODE_TUI_CONFIG).toBeUndefined();
      expect(env.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe('true');
      expect(env.OPENCODE_DISABLE_EXTERNAL_SKILLS).toBe('true');
      expect(env.OPENCODE_PURE).toBe('true');
      expect(env.OPENCODE_PERMISSION).toBeUndefined();

      delete process.env.OPENCODE_CONFIG;
      delete process.env.OPENCODE_TUI_CONFIG;
      delete process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS;
      delete process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS;
      delete process.env.OPENCODE_PURE;
      delete process.env.OPENCODE_PERMISSION;
    });
  });

  describe('plugin isolation mode', () => {
    it('should enable OPENCODE_PURE in pure mode', () => {
      context.setManager(new ServerManager({
        ...context.defaultConfig,
        pluginIsolationMode: 'pure',
      }));

      const env = context.getLauncherTestAccess().getSpawnEnv();

      expect(env.OPENCODE_PURE).toBe('true');
    });
  });

  describe('macOS GUI launch environment', () => {
    it('adds common Node install locations to PATH for opencode npm wrappers', () => {
      const restorePlatform = mockProcessPlatform('darwin');
      const homeDir = path.join(context.testVaultPath, 'Home');

      try {
        process.env.HOME = homeDir;
        process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
        delete process.env.Path;
        delete process.env.path;

        const env = context.getLauncherTestAccess().getSpawnEnv();

        expect(env.PATH?.split(path.delimiter)).toEqual(expect.arrayContaining([
          '/opt/homebrew/bin',
          '/usr/local/bin',
          path.join(homeDir, '.opencode', 'bin'),
        ]));
      } finally {
        restorePlatform();
      }
    });
  });
}

describe('ServerManager lifecycle and environment', () => {
  let manager: ServerManager;
  const testVaultPath = path.join(__dirname, 'server-manager-lifecycle-vault');
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

  registerStateAndHealthTests(context);
  registerEnvironmentAndBinaryTests(context);
});
