/**
 * ServerManager runtime seam unit tests
 */

import * as fs from 'fs';
import * as path from 'path';

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

const { Notice: mockNotice } = jest.requireMock('obsidian') as {
  Notice: jest.Mock;
  requestUrl: jest.Mock;
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

type ServerManagerRuntimeContext = {
  defaultConfig: typeof defaultConfig;
  getManager(): ServerManager;
  setManager(nextManager: ServerManager): ServerManager;
  testVaultPath: string;
};

function registerManagedLifecycleTests(context: ServerManagerRuntimeContext): void {
  describe('managed server adoption', () => {
    it('treats legacy managed server state without signature metadata as stale', async () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 1234,
            host: '127.0.0.1',
            port: 4196,
          },
        },
      ));

      jest.spyOn(manager as never, 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1',
      );

      await expect((manager as never).tryAdoptManagedServer()).resolves.toBe('restart');
    });

    it('adopts a managed server when its signature still matches current launch context', async () => {
      fs.mkdirSync(path.join(context.testVaultPath, '.opencode'), { recursive: true });
      fs.writeFileSync(
        path.join(context.testVaultPath, '.opencode', 'opencode.json'),
        JSON.stringify({ $schema: 'https://opencode.ai/config.json', disabled_providers: [] }),
        'utf-8',
      );

      const signatureManager = new ServerManager(context.defaultConfig);
      signatureManager.setWorkingDirectory(context.testVaultPath);
      const workingDirectory = path.resolve(context.testVaultPath);
      const configFingerprint = (signatureManager as never).getConfigFingerprint() as string;

      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 1234,
            host: '127.0.0.1',
            port: 4196,
            signatureVersion: 1,
            workingDirectory,
            modelSourceMode: 'merge',
            pluginIsolationMode: 'default',
            configFingerprint,
          },
        },
      ));
      manager.setWorkingDirectory(context.testVaultPath);

      jest.spyOn(manager as never, 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1',
      );

      await expect((manager as never).tryAdoptManagedServer()).resolves.toBe('adopted');
    });

    it('restarts a stale managed OpenCode server instead of silently reusing it', async () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 1234,
            host: '127.0.0.1',
            port: 4196,
          },
        },
      ));

      jest.spyOn(manager as never, 'isPortAvailable').mockResolvedValue(false);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('restart');
      const restartManagedServer = jest.spyOn(manager as never, 'restartManagedServer').mockResolvedValue(undefined);
      const spawnServer = jest.spyOn(manager as never, 'spawnServer').mockResolvedValue(undefined);
      const waitForHealthy = jest.spyOn(manager as never, 'waitForHealthy').mockResolvedValue(undefined);

      await expect(manager.start()).resolves.toBeUndefined();

      expect(restartManagedServer).toHaveBeenCalled();
      expect(spawnServer).toHaveBeenCalled();
      expect(waitForHealthy).toHaveBeenCalledWith(30000);
      expect(manager.getStatus()).toBe('running');
    });

    it('centralizes healthy occupied local endpoint resolution for stale managed servers', async () => {
      const manager = context.getManager();
      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('restart');

      await expect((manager as never).resolveOccupiedHealthyLocalEndpoint()).resolves.toEqual({
        action: 'restart-managed',
      });
    });

    it('marks a custom-port healthy server as conflict instead of silently reusing it', async () => {
      const manager = context.setManager(new ServerManager({
        ...context.defaultConfig,
        baseUrl: 'http://127.0.0.1:5000',
        local: {
          host: '127.0.0.1',
          port: 5000,
          autoStart: true,
        },
      }));

      jest.spyOn(manager as never, 'isPortAvailable').mockResolvedValue(false);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
      jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
        pid: 4321,
        commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
        looksLikeOpenCodeServe: true,
      });

      await expect(manager.start()).rejects.toThrow(/occupies local endpoint 127.0.0.1:5000/i);
      expect(manager.getStatus()).toBe('conflict');
      expect(manager.getServerDiagnosticsSnapshot()).toMatchObject({
        reason: 'local-conflict',
        host: '127.0.0.1',
        port: 5000,
        pid: 4321,
      });
    });

    it('builds conflict diagnostics from the occupied local endpoint resolution seam', async () => {
      const manager = context.setManager(new ServerManager({
        ...context.defaultConfig,
        baseUrl: 'http://127.0.0.1:5000',
        local: {
          host: '127.0.0.1',
          port: 5000,
          autoStart: true,
        },
      }));

      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
      jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
        pid: 4321,
        commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
        looksLikeOpenCodeServe: true,
      });
      jest.spyOn(manager as never, 'shouldRecycleUnknownLocalServer').mockResolvedValue(false);

      await expect((manager as never).resolveOccupiedHealthyLocalEndpoint()).resolves.toMatchObject({
        action: 'conflict',
        diagnostics: {
          reason: 'local-conflict',
          host: '127.0.0.1',
          port: 5000,
          pid: 4321,
          commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
        },
      });
    });

    it('recycles an orphaned default-port OpenCode sidecar and restarts the current vault service', async () => {
      const manager = context.getManager();
      jest.spyOn(manager as never, 'isPortAvailable').mockResolvedValue(false);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
      jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
        pid: 5678,
        commandLine: 'opencode serve --port 4196 --hostname 127.0.0.1',
        looksLikeOpenCodeServe: true,
      });
      const recycleUnknownLocalServer = jest.spyOn(manager as never, 'recycleUnknownLocalServer').mockResolvedValue(undefined);
      const spawnServer = jest.spyOn(manager as never, 'spawnServer').mockResolvedValue(undefined);
      const waitForHealthy = jest.spyOn(manager as never, 'waitForHealthy').mockResolvedValue(undefined);

      await expect(manager.start()).resolves.toBeUndefined();

      expect(recycleUnknownLocalServer).toHaveBeenCalled();
      expect(spawnServer).toHaveBeenCalled();
      expect(waitForHealthy).toHaveBeenCalledWith(30000);
      expect(manager.getStatus()).toBe('running');
      expect(manager.getServerDiagnosticsSnapshot()).toMatchObject({
        reason: 'local-orphan-restarted',
        host: '127.0.0.1',
        port: 4196,
        pid: 5678,
      });
    });
  });

  describe('dispose', () => {
    it('synchronously clears the managed process when unloading', () => {
      const manager = context.getManager();
      (manager as unknown as { process: { pid: number } }).process = { pid: 2468 } as { pid: number };
      const terminateManagedPidSync = jest.spyOn(manager as never, 'terminateManagedPidSync').mockImplementation(() => {});

      manager.dispose();

      expect(terminateManagedPidSync).toHaveBeenCalledWith(2468);
      expect(manager.getStatus()).toBe('stopped');
    });

    it('synchronously clears an adopted pid when no child process is attached', () => {
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
      const terminateManagedPidSync = jest.spyOn(manager as never, 'terminateManagedPidSync').mockImplementation(() => {});

      manager.dispose();

      expect(terminateManagedPidSync).toHaveBeenCalledWith(1357);
      expect(manager.getManagedServerStateSnapshot()).toBeNull();
      expect(manager.getStatus()).toBe('stopped');
    });
  });
}

function registerLaunchLifecycleTests(context: ServerManagerRuntimeContext): void {
  describe('shutdown lifecycle seam', () => {
    it('centralizes stale managed restart teardown and port-release waiting', async () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: {
            pid: 1234,
            host: '127.0.0.1',
            port: 4196,
          },
        },
      ));
      const terminateManagedPid = jest.spyOn(manager as never, 'terminateManagedPid').mockResolvedValue(undefined);
      const waitForPortAvailability = jest.spyOn(manager as never, 'waitForPortAvailability').mockResolvedValue(true);

      await expect((manager as never).restartManagedServer()).resolves.toBeUndefined();

      expect(terminateManagedPid).toHaveBeenCalledWith(1234);
      expect(waitForPortAvailability).toHaveBeenCalledWith(5000);
      expect(manager.getManagedServerStateSnapshot()).toBeNull();
    });
  });

  describe('launch runtime seam', () => {
    it('centralizes successful local launch completion and optional diagnostics', async () => {
      const manager = context.getManager();
      const successDiagnostics = {
        reason: 'local-orphan-restarted' as const,
        host: '127.0.0.1',
        port: 4196,
        pid: 5678,
        message: 'Detected and restarted an orphaned plugin sidecar.',
      };
      const spawnServer = jest.spyOn(manager as never, 'spawnServer').mockResolvedValue(undefined);
      const waitForHealthy = jest.spyOn(manager as never, 'waitForHealthy').mockResolvedValue(undefined);

      await expect((manager as never).launchLocalServerRuntime(successDiagnostics)).resolves.toBeUndefined();

      expect(spawnServer).toHaveBeenCalled();
      expect(waitForHealthy).toHaveBeenCalledWith(30000);
      expect(manager.getServerDiagnosticsSnapshot()).toMatchObject(successDiagnostics);
      expect(manager.getStatus()).toBe('running');
      expect(mockNotice).toHaveBeenCalledWith('OpenCode server started');
    });

    it('formats launch failures from an immutable launch snapshot', () => {
      const manager = context.getManager();
      const activeLaunch = {
        outputTail: ['boot log\n'],
        exited: true,
        exitCode: 1,
        signal: null,
        error: null,
        cleanup: jest.fn(),
      };
      (manager as unknown as { activeLaunch: typeof activeLaunch }).activeLaunch = activeLaunch;

      const snapshot = (manager as never).getActiveLaunchSnapshot() as { outputTail: string[] } | null;
      expect(snapshot).not.toBeNull();
      if (!snapshot) {
        return;
      }

      activeLaunch.outputTail.push('mutated later\n');

      const error = (manager as never).buildLaunchFailureError('Launch failed', snapshot) as Error;

      expect(error.message).toContain('boot log');
      expect(error.message).not.toContain('mutated later');
    });
  });

  describe('launch failures', () => {
    it('includes captured server output when startup fails early', async () => {
      const manager = context.getManager();
      (manager as unknown as { activeLaunch: Record<string, unknown> }).activeLaunch = {
        outputTail: ['boot log\n', 'fatal: bad config\n'],
        exited: true,
        exitCode: 1,
        signal: null,
        error: null,
        cleanup: jest.fn(),
      };

      await expect((manager as never).waitForHealthy(100)).rejects.toThrow(/Server output:\nboot log\nfatal: bad config/i);
    });
  });
}

describe('ServerManager runtime seams', () => {
  let manager: ServerManager;
  const testVaultPath = path.join(__dirname, 'server-manager-runtime-vault');
  const originalEnv = { ...process.env };
  const getManager = (): ServerManager => manager;
  const setManager = (nextManager: ServerManager): ServerManager => {
    manager = nextManager;
    return manager;
  };

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

  const context: ServerManagerRuntimeContext = {
    defaultConfig,
    getManager,
    setManager,
    testVaultPath,
  };

  registerManagedLifecycleTests(context);
  registerLaunchLifecycleTests(context);
});
