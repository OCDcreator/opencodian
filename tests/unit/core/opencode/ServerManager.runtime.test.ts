/**
 * ServerManager runtime seam unit tests
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

const { Notice: mockNotice } = jest.requireMock('obsidian') as {
  Notice: jest.Mock;
  requestUrl: jest.Mock;
};

function getProcessProbe(manager: ServerManager): LocalProcessProbe {
  return (manager as unknown as { processProbe: LocalProcessProbe }).processProbe;
}

type LocalSidecarLauncherTestAccess = LocalSidecarLauncher & {
  getActiveLaunchSnapshot(): { outputTail: string[] } | null;
  buildLaunchFailureError(message: string, launch?: unknown): Error;
  waitForHealthy(timeout: number, checkHealth: (timeout: number) => Promise<boolean>): Promise<void>;
};

function getLocalSidecarLauncher(manager: ServerManager): LocalSidecarLauncher {
  return (manager as unknown as { localSidecarLauncher: LocalSidecarLauncher }).localSidecarLauncher;
}

function getLocalSidecarLauncherTestAccess(manager: ServerManager): LocalSidecarLauncherTestAccess {
  return getLocalSidecarLauncher(manager) as LocalSidecarLauncherTestAccess;
}

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

      jest.spyOn(getProcessProbe(manager), 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1',
      );
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(1234);

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

      jest.spyOn(getProcessProbe(manager), 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1',
      );
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(1234);

      await expect((manager as never).tryAdoptManagedServer()).resolves.toBe('adopted');
    });

    it('restarts when the current listener no longer matches the persisted listener pid', async () => {
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
          initialManagedServerState: ({
            pid: 4321,
            launcherPid: 1234,
            listenerPid: 4321,
            host: '127.0.0.1',
            port: 4196,
            signatureVersion: 1,
            workingDirectory,
            modelSourceMode: 'merge',
            pluginIsolationMode: 'default',
            configFingerprint,
          } as unknown) as ConstructorParameters<typeof ServerManager>[2]['initialManagedServerState'],
        },
      ));
      manager.setWorkingDirectory(context.testVaultPath);

      jest.spyOn(getProcessProbe(manager), 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1 --cors app://obsidian.md --cors app://obsidian',
      );
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(9999);

      await expect((manager as never).tryAdoptManagedServer()).resolves.toBe('restart');
    });

    it('adopts and upgrades a legacy single-pid snapshot to the live listener pid', async () => {
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
            pid: 20976,
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

      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(23332);
      jest.spyOn(getProcessProbe(manager), 'getProcessCommandLine').mockResolvedValue(
        'opencode serve --port 4196 --hostname 127.0.0.1 --cors app://obsidian.md --cors app://obsidian',
      );

      await expect((manager as never).tryAdoptManagedServer()).resolves.toBe('adopted');
      expect(manager.getManagedServerStateSnapshot()).toMatchObject({
        pid: 23332,
        launcherPid: 20976,
        listenerPid: 23332,
      });
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

      jest.spyOn(getProcessProbe(manager), 'canBindLocalEndpoint').mockResolvedValue(false);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('restart');
      const restartManagedServer = jest.spyOn(manager as never, 'restartManagedServer').mockResolvedValue(undefined);
      const launchRuntime = jest.spyOn(getLocalSidecarLauncher(manager), 'launchRuntime').mockResolvedValue({
        process: { pid: 1234 } as never,
        launchStartedAt: 0,
        spawnedAt: 10,
        healthyAt: 20,
      });
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(1234);

      await expect(manager.start()).resolves.toBeUndefined();

      expect(restartManagedServer).toHaveBeenCalled();
      expect(launchRuntime).toHaveBeenCalledWith(expect.objectContaining({
        timeout: 30000,
      }));
      expect(manager.getStatus()).toBe('running');
    });

  });

  describe('dispose', () => {
    it('synchronously clears the managed process when unloading', () => {
      const manager = context.getManager();
      (manager as unknown as { process: { pid: number } }).process = { pid: 2468 } as { pid: number };
      const terminateManagedPidSync = jest.spyOn(getProcessProbe(manager), 'terminateManagedPidSync').mockImplementation(() => {});

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
      const terminateManagedPidSync = jest.spyOn(getProcessProbe(manager), 'terminateManagedPidSync').mockImplementation(() => {});

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
      const terminateManagedPid = jest.spyOn(getProcessProbe(manager), 'terminateManagedPid').mockResolvedValue(undefined);
      const waitForPortAvailability = jest.spyOn(getProcessProbe(manager), 'waitForPortAvailability').mockResolvedValue(true);
      jest.spyOn(getProcessProbe(manager), 'getCurrentPluginManagedListenerPid').mockResolvedValue(null);

      await expect((manager as never).restartManagedServer()).resolves.toBeUndefined();

      expect(terminateManagedPid).toHaveBeenCalledWith(1234);
      expect(waitForPortAvailability).toHaveBeenCalledWith('127.0.0.1', 4196, 5000);
      expect(manager.getManagedServerStateSnapshot()).toBeNull();
    });

    it('preserves managed state when stop cannot confirm the local port was released', async () => {
      const manager = context.setManager(new ServerManager(
        context.defaultConfig,
        {},
        {
          initialManagedServerState: ({
            pid: 2468,
            listenerPid: 2468,
            host: '127.0.0.1',
            port: 4196,
            signatureVersion: 1,
            workingDirectory: path.resolve(context.testVaultPath),
            modelSourceMode: 'merge',
            pluginIsolationMode: 'default',
            configFingerprint: 'fp',
          } as unknown) as ConstructorParameters<typeof ServerManager>[2]['initialManagedServerState'],
        },
      ));
      (manager as unknown as { status: string }).status = 'running';
      const terminateManagedPid = jest.spyOn(getProcessProbe(manager), 'terminateManagedPid').mockResolvedValue(undefined);
      const waitForPortAvailability = jest.spyOn(getProcessProbe(manager), 'waitForPortAvailability').mockResolvedValue(false);

      await expect(manager.stop()).rejects.toThrow(/port 4196/i);

      expect(terminateManagedPid).toHaveBeenCalled();
      expect(waitForPortAvailability).toHaveBeenCalledWith('127.0.0.1', 4196, 5000);
      expect(manager.getManagedServerStateSnapshot()).not.toBeNull();
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
      const launchRuntime = jest.spyOn(getLocalSidecarLauncher(manager), 'launchRuntime').mockResolvedValue({
        process: { pid: 4321 } as never,
        launchStartedAt: 0,
        spawnedAt: 10,
        healthyAt: 20,
      });
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(4321);

      await expect((manager as never).launchLocalServerRuntime(successDiagnostics)).resolves.toBeUndefined();

      expect(launchRuntime).toHaveBeenCalledWith(expect.objectContaining({
        timeout: 30000,
      }));
      expect(manager.getServerDiagnosticsSnapshot()).toMatchObject(successDiagnostics);
      expect(manager.getStatus()).toBe('running');
      expect(mockNotice).toHaveBeenCalledWith('OpenCode server started');
    });

    it('refreshes the managed state with the live listener pid after startup succeeds', async () => {
      const manager = context.getManager();
      const launchRuntime = jest.spyOn(getLocalSidecarLauncher(manager), 'launchRuntime').mockResolvedValue({
        process: { pid: 1111 } as never,
        launchStartedAt: 0,
        spawnedAt: 10,
        healthyAt: 20,
      });
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(2468);

      await expect((manager as never).launchLocalServerRuntime()).resolves.toBeUndefined();

      expect(launchRuntime).toHaveBeenCalledWith(expect.objectContaining({
        timeout: 30000,
      }));
      expect(manager.getManagedServerStateSnapshot()).toMatchObject({
        listenerPid: 2468,
        pid: 2468,
      });
    });

    it('cleans up the spawned process when health never becomes ready', async () => {
      const manager = context.setManager(new ServerManager({
        ...context.defaultConfig,
        timeout: 1,
      }));
      const pathBinDir = path.join(context.testVaultPath, 'PathBin');
      const binaryPath = path.join(pathBinDir, 'opencode');
      const spawnedProcess = {
        pid: 13579,
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        kill: jest.fn(),
        stdout: { on: jest.fn(), removeListener: jest.fn() },
        stderr: { on: jest.fn(), removeListener: jest.fn() },
        killed: false,
      };

      fs.mkdirSync(pathBinDir, { recursive: true });
      fs.writeFileSync(binaryPath, '#!/bin/sh', 'utf-8');
      process.env.PATH = pathBinDir;

      const { spawn: mockSpawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
      mockSpawn.mockReturnValueOnce(spawnedProcess);
      jest.spyOn(getProcessProbe(manager), 'canBindLocalEndpoint').mockResolvedValue(true);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(false);
      jest.spyOn(getProcessProbe(manager), 'waitForPortAvailability').mockResolvedValue(true);

      await expect(manager.start()).rejects.toThrow(/failed to start/i);

      expect(spawnedProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.getManagedServerStateSnapshot()).toBeNull();
    });

    it('preserves the live listener state when a Windows launcher wrapper exits', async () => {
      const manager = context.getManager();
      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      const spawnedProcess = {
        pid: 1111,
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
          eventHandlers.set(event, handler);
        }),
        once: jest.fn(),
        removeListener: jest.fn(),
        kill: jest.fn(),
        stdout: { on: jest.fn(), removeListener: jest.fn() },
        stderr: { on: jest.fn(), removeListener: jest.fn() },
        killed: false,
      };
      const { spawn: mockSpawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
      const pathBinDir = path.join(context.testVaultPath, 'WrapperPathBin');
      const binaryPath = path.join(pathBinDir, 'opencode');

      fs.mkdirSync(pathBinDir, { recursive: true });
      fs.writeFileSync(binaryPath, '#!/bin/sh', 'utf-8');
      process.env.PATH = pathBinDir;
      mockSpawn.mockReturnValueOnce(spawnedProcess);
      jest.spyOn(getProcessProbe(manager), 'canBindLocalEndpoint').mockResolvedValue(true);
      jest.spyOn(getProcessProbe(manager), 'getListeningProcessId').mockResolvedValue(2468);
      jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
      jest.spyOn(LocalProcessProbe.prototype, 'getCurrentPluginManagedListenerPidSync').mockReturnValue(2468);

      await expect(manager.start()).resolves.toBeUndefined();
      eventHandlers.get('exit')?.(0, null);

      expect(manager.getManagedServerStateSnapshot()).toMatchObject({
        pid: 2468,
        launcherPid: 1111,
        listenerPid: 2468,
      });
      expect(manager.getStatus()).toBe('running');
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
      (getLocalSidecarLauncher(manager) as unknown as { activeLaunch: typeof activeLaunch }).activeLaunch = activeLaunch;

      const snapshot = getLocalSidecarLauncherTestAccess(manager).getActiveLaunchSnapshot();
      expect(snapshot).not.toBeNull();
      if (!snapshot) {
        return;
      }

      activeLaunch.outputTail.push('mutated later\n');

      const error = getLocalSidecarLauncherTestAccess(manager).buildLaunchFailureError('Launch failed', snapshot) as Error;

      expect(error.message).toContain('boot log');
      expect(error.message).not.toContain('mutated later');
    });
  });

  describe('launch failures', () => {
    it('includes captured server output when startup fails early', async () => {
      const manager = context.getManager();
      (getLocalSidecarLauncher(manager) as unknown as { activeLaunch: Record<string, unknown> }).activeLaunch = {
        outputTail: ['boot log\n', 'fatal: bad config\n'],
        exited: true,
        exitCode: 1,
        signal: null,
        error: null,
        cleanup: jest.fn(),
      };

      await expect(
        getLocalSidecarLauncherTestAccess(manager).waitForHealthy(100, async () => false),
      ).rejects.toThrow(/Server output:\nboot log\nfatal: bad config/i);
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
