import {
  type OpenCodeServiceLifecycleAssemblyHost,
  OpenCodeServiceLifecycleCoordinator,
  type OpenCodeServiceLifecycleCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeServiceLifecycleCoordinator';
import { ServerManager } from '../../../../src/core/opencode/ServerManager';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { OpenCodianSettings } from '../../../../src/core/types/settings';
import { getServerBaseUrl } from '../../../../src/core/types/settings';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
}

function createHost(
  overrides: Partial<OpenCodeServiceLifecycleCoordinatorHost> = {},
): jest.Mocked<OpenCodeServiceLifecycleCoordinatorHost> {
  const host = {
    getSettings: jest.fn(() => DEFAULT_SETTINGS),
    setSettings: jest.fn(),
    getBaseUrl: jest.fn(() => 'http://127.0.0.1:4096'),
    setBaseUrl: jest.fn(),
    getToolCatalogScopeKey: jest.fn(() => 'http://127.0.0.1:4096::'),
    shouldUseSdkCrud: jest.fn(() => true),
    checkSdkHealth: jest.fn().mockResolvedValue(true),
    logHealthProbeFallback: jest.fn(),
    resetTransientConnectivityLogState: jest.fn(),
    notifyServerStatusChange: jest.fn(),
    setVaultPath: jest.fn(),
    clearToolSchemaCacheIfScopeChanged: jest.fn(),
    fetchAvailableModels: jest.fn().mockResolvedValue({
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          models: [{ id: 'gpt-5', name: 'GPT-5' }],
        },
      ],
    }),
    refreshToolIds: jest.fn().mockResolvedValue(undefined),
    refreshMcpServerStatus: jest.fn().mockResolvedValue(undefined),
    notifyModelsLoaded: jest.fn(),
    serverManager: {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      checkHealth: jest.fn().mockResolvedValue(true),
      setWorkingDirectory: jest.fn(),
      isRunning: jest.fn().mockReturnValue(false),
      updateConfig: jest.fn(),
      canBindLocalEndpoint: jest.fn().mockResolvedValue(true),
      restart: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn(() => 'stopped'),
      getServerDiagnosticsSnapshot: jest.fn(() => ({ reason: 'none' })),
      getManagedServerStateSnapshot: jest.fn(() => null),
    },
    syncEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscription: jest.fn(),
      stopSubscription: jest.fn(),
      restartSubscription: jest.fn(),
    },
    openCodeEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscriptions: jest.fn(),
      stopSubscriptions: jest.fn(),
      restartSubscriptions: jest.fn(),
    },
    ...overrides,
  };

  return host as unknown as jest.Mocked<OpenCodeServiceLifecycleCoordinatorHost>;
}

function createAssemblyHost(
  overrides: Partial<OpenCodeServiceLifecycleAssemblyHost> = {},
): jest.Mocked<OpenCodeServiceLifecycleAssemblyHost> {
  const host = {
    getSettings: jest.fn(() => DEFAULT_SETTINGS),
    setSettings: jest.fn(),
    getBaseUrl: jest.fn(() => 'http://127.0.0.1:4096'),
    setBaseUrl: jest.fn(),
    getToolCatalogScopeKey: jest.fn(() => 'http://127.0.0.1:4096::'),
    shouldUseSdkCrud: jest.fn(() => true),
    checkSdkHealth: jest.fn().mockResolvedValue(true),
    logHealthProbeFallback: jest.fn(),
    resetTransientConnectivityLogState: jest.fn(),
    onServerStatusChange: jest.fn(),
    onError: jest.fn(),
    setVaultPath: jest.fn(),
    clearToolSchemaCacheIfScopeChanged: jest.fn(),
    fetchAvailableModels: jest.fn().mockResolvedValue({
      providers: [],
    }),
    refreshToolIds: jest.fn().mockResolvedValue(undefined),
    refreshMcpServerStatus: jest.fn().mockResolvedValue(undefined),
    onModelsLoaded: jest.fn(),
    syncEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscription: jest.fn(),
      stopSubscription: jest.fn(),
      restartSubscription: jest.fn(),
    },
    openCodeEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscriptions: jest.fn(),
      stopSubscriptions: jest.fn(),
      restartSubscriptions: jest.fn(),
    },
    ...overrides,
  };

  return host as unknown as jest.Mocked<OpenCodeServiceLifecycleAssemblyHost>;
}

function createSettingsHarness(
  overrides: Partial<{
    serverManager: Partial<OpenCodeServiceLifecycleCoordinatorHost['serverManager']>;
    syncEvents: Partial<OpenCodeServiceLifecycleCoordinatorHost['syncEvents']>;
    openCodeEvents: Partial<OpenCodeServiceLifecycleCoordinatorHost['openCodeEvents']>;
  }> = {},
) {
  let currentSettings = cloneSettings(DEFAULT_SETTINGS);
  let currentBaseUrl = getServerBaseUrl(currentSettings.server);

  const host = createHost({
    getSettings: jest.fn(() => currentSettings),
    setSettings: jest.fn((settings: OpenCodianSettings) => {
      currentSettings = settings;
    }),
    getBaseUrl: jest.fn(() => currentBaseUrl),
    setBaseUrl: jest.fn((baseUrl: string) => {
      currentBaseUrl = baseUrl;
    }),
    getToolCatalogScopeKey: jest.fn(() => `${currentBaseUrl}::`),
    clearToolSchemaCacheIfScopeChanged: jest.fn(),
    serverManager: {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      checkHealth: jest.fn().mockResolvedValue(true),
      setWorkingDirectory: jest.fn(),
      isRunning: jest.fn().mockReturnValue(false),
      updateConfig: jest.fn(),
      canBindLocalEndpoint: jest.fn().mockResolvedValue(true),
      restart: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn(() => 'stopped'),
      getServerDiagnosticsSnapshot: jest.fn(() => ({ reason: 'none' })),
      getManagedServerStateSnapshot: jest.fn(() => null),
      ...overrides.serverManager,
    },
    syncEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscription: jest.fn(),
      stopSubscription: jest.fn(),
      restartSubscription: jest.fn(),
      ...overrides.syncEvents,
    },
    openCodeEvents: {
      hasListeners: jest.fn().mockReturnValue(false),
      ensureSubscriptions: jest.fn(),
      stopSubscriptions: jest.fn(),
      restartSubscriptions: jest.fn(),
      ...overrides.openCodeEvents,
    },
  });

  return {
    coordinator: new OpenCodeServiceLifecycleCoordinator(host),
    host,
    serverManager: host.serverManager,
    syncEvents: host.syncEvents,
    openCodeEvents: host.openCodeEvents,
    getCurrentSettings: () => currentSettings,
    getCurrentBaseUrl: () => currentBaseUrl,
  };
}

describe('OpenCodeServiceLifecycleCoordinator lifecycle runtime', () => {
  it('assembles lifecycle ownership around one server manager', () => {
    const managedServerState = {
      pid: 1234,
      host: '127.0.0.1',
      port: 4096,
    };
    const host = createAssemblyHost({
      initialManagedServerState: managedServerState,
    });

    const assembly = OpenCodeServiceLifecycleCoordinator.createAssembly(host);
    const lifecycleHost = (
      assembly.serviceLifecycle as unknown as {
        host: OpenCodeServiceLifecycleCoordinatorHost;
      }
    ).host;

    expect(assembly.serverManager).toBeInstanceOf(ServerManager);
    expect(assembly.serverManager.getManagedServerStateSnapshot()).toEqual(managedServerState);
    expect(lifecycleHost.serverManager).toBe(assembly.serverManager);
    expect(assembly.serviceLifecycle.getServerRuntimeMetadata()).toEqual({
      serverStatus: 'stopped',
      isManagedServerRunning: false,
      managedServerState,
    });

    const handleServerStatusChange = jest
      .spyOn(assembly.serviceLifecycle, 'handleServerStatusChange')
      .mockImplementation(() => undefined);
    const serverManagerEvents = (assembly.serverManager as unknown as {
      events: {
        onStatusChange?: (status: 'running') => void;
        onError?: (error: Error) => void;
      };
    }).events;

    serverManagerEvents.onStatusChange?.('running');
    expect(handleServerStatusChange).toHaveBeenCalledWith('running');

    const error = new Error('lifecycle boom');
    serverManagerEvents.onError?.(error);
    expect(host.onError).toHaveBeenCalledWith(error);
  });

  it('initializes by starting only when local auto-start is enabled', async () => {
    const host = createHost();
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    await coordinator.initialize();

    expect(host.serverManager.start).toHaveBeenCalledTimes(1);
    expect(host.syncEvents.ensureSubscription).toHaveBeenCalledTimes(1);
    expect(host.openCodeEvents.ensureSubscriptions).toHaveBeenCalledTimes(1);

    const disabledHost = createHost({
      getSettings: jest.fn(() => ({
        ...DEFAULT_SETTINGS,
        server: {
          ...DEFAULT_SETTINGS.server,
          local: { ...DEFAULT_SETTINGS.server.local, autoStart: false },
        },
      })),
    });
    const disabledCoordinator = new OpenCodeServiceLifecycleCoordinator(disabledHost);

    await disabledCoordinator.initialize();

    expect(disabledHost.serverManager.start).not.toHaveBeenCalled();
    expect(disabledHost.syncEvents.ensureSubscription).not.toHaveBeenCalled();
    expect(disabledHost.openCodeEvents.ensureSubscriptions).not.toHaveBeenCalled();
  });

  it('owns start, stop, dispose, and restart subscription ordering', async () => {
    const host = createHost();
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    await coordinator.start();
    await coordinator.stop();
    coordinator.restartEventSubscriptions();
    coordinator.dispose();

    expect(host.serverManager.start).toHaveBeenCalledTimes(1);
    expect(host.serverManager.start.mock.invocationCallOrder[0]).toBeLessThan(
      host.syncEvents.ensureSubscription.mock.invocationCallOrder[0],
    );
    expect(host.syncEvents.stopSubscription).toHaveBeenCalledTimes(2);
    expect(host.openCodeEvents.stopSubscriptions).toHaveBeenCalledTimes(2);
    expect(host.serverManager.stop).toHaveBeenCalledTimes(1);
    expect(host.syncEvents.restartSubscription).toHaveBeenCalledTimes(1);
    expect(host.openCodeEvents.restartSubscriptions).toHaveBeenCalledTimes(1);
    expect(host.serverManager.dispose).toHaveBeenCalledTimes(1);
  });

  it('owns vault-path scope refresh before restarting subscriptions', () => {
    const host = createHost();
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    coordinator.setVaultPath('/tmp/test-vault');

    expect(host.getToolCatalogScopeKey).toHaveBeenCalledTimes(1);
    expect(host.setVaultPath).toHaveBeenCalledWith('/tmp/test-vault');
    expect(host.serverManager.setWorkingDirectory).toHaveBeenCalledWith('/tmp/test-vault');
    expect(host.clearToolSchemaCacheIfScopeChanged).toHaveBeenCalledWith('http://127.0.0.1:4096::');
    expect(host.syncEvents.restartSubscription).toHaveBeenCalledTimes(1);
    expect(host.openCodeEvents.restartSubscriptions).toHaveBeenCalledTimes(1);
    expect(host.setVaultPath.mock.invocationCallOrder[0]).toBeLessThan(
      host.syncEvents.restartSubscription.mock.invocationCallOrder[0],
    );
  });

  it('runs model and catalog bootstrap after the server reports running', async () => {
    const host = createHost();
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    coordinator.handleServerStatusChange('running');
    await flushAsync();

    expect(host.notifyServerStatusChange).toHaveBeenCalledWith('running');
    expect(host.resetTransientConnectivityLogState).toHaveBeenCalledTimes(1);
    expect(host.fetchAvailableModels).toHaveBeenCalledTimes(1);
    expect(host.refreshToolIds).toHaveBeenCalledTimes(1);
    expect(host.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
    expect(host.notifyModelsLoaded).toHaveBeenCalledWith([
      {
        id: 'openai',
        name: 'OpenAI',
        models: [{ id: 'gpt-5', name: 'GPT-5' }],
      },
    ]);
  });

  it('falls back from SDK health to the server manager probe', async () => {
    const sdkError = new Error('sdk health failed');
    const host = createHost({
      checkSdkHealth: jest.fn().mockRejectedValue(sdkError),
      serverManager: {
        start: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn(),
        checkHealth: jest.fn().mockResolvedValue(true),
        setWorkingDirectory: jest.fn(),
        isRunning: jest.fn().mockReturnValue(false),
        updateConfig: jest.fn(),
        canBindLocalEndpoint: jest.fn().mockResolvedValue(true),
        restart: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn(() => 'stopped'),
        getServerDiagnosticsSnapshot: jest.fn(() => ({ reason: 'none' })),
        getManagedServerStateSnapshot: jest.fn(() => null),
      },
    });
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    await expect(coordinator.checkHealth()).resolves.toBe(true);

    expect(host.logHealthProbeFallback).toHaveBeenCalledWith(sdkError);
    expect(host.serverManager.checkHealth).toHaveBeenCalledWith(3000);
    expect(host.resetTransientConnectivityLogState).toHaveBeenCalledTimes(1);
  });

  it('normalizes structured SDK health responses before skipping the legacy probe', async () => {
    const host = createHost({
      checkSdkHealth: jest.fn().mockResolvedValue({ healthy: true }),
    });
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    await expect(coordinator.checkHealth()).resolves.toBe(true);

    expect(host.serverManager.checkHealth).not.toHaveBeenCalled();
    expect(host.resetTransientConnectivityLogState).toHaveBeenCalledTimes(1);
  });

});

describe('OpenCodeServiceLifecycleCoordinator settings updates', () => {
  it('restarts the managed server when local runtime settings change', async () => {
    const harness = createSettingsHarness({
      serverManager: {
        isRunning: jest.fn().mockReturnValue(true),
      },
      syncEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
      openCodeEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
    });
    const nextSettings = cloneSettings(DEFAULT_SETTINGS);
    nextSettings.server.local.port = 5000;

    await harness.coordinator.updateSettings(nextSettings);

    expect(harness.serverManager.canBindLocalEndpoint).toHaveBeenCalledWith('127.0.0.1', 5000);
    expect(harness.serverManager.updateConfig).toHaveBeenCalledWith(
      OpenCodeServiceLifecycleCoordinator.createServerConfig(nextSettings),
    );
    expect(harness.serverManager.restart).toHaveBeenCalledTimes(1);
    expect(harness.serverManager.stop).not.toHaveBeenCalled();
    expect(harness.syncEvents.stopSubscription).toHaveBeenCalledWith(true);
    expect(harness.openCodeEvents.stopSubscriptions).toHaveBeenCalledWith(true);
    expect(harness.syncEvents.ensureSubscription).toHaveBeenCalledTimes(1);
    expect(harness.openCodeEvents.ensureSubscriptions).toHaveBeenCalledTimes(1);
    expect(harness.getCurrentSettings()).toEqual(nextSettings);
    expect(harness.getCurrentSettings()).not.toBe(nextSettings);
    expect(harness.getCurrentBaseUrl()).toBe('http://127.0.0.1:5000');
  });

  it('rolls back settings and restores the previous managed server after a failed restart', async () => {
    const harness = createSettingsHarness({
      serverManager: {
        isRunning: jest.fn().mockReturnValue(true),
        restart: jest.fn().mockRejectedValue(new Error('restart failed')),
      },
      syncEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
      openCodeEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
    });
    const nextSettings = cloneSettings(DEFAULT_SETTINGS);
    nextSettings.server.local.port = 5000;

    await expect(harness.coordinator.updateSettings(nextSettings)).rejects.toThrow('restart failed');

    expect(harness.serverManager.updateConfig).toHaveBeenNthCalledWith(
      1,
      OpenCodeServiceLifecycleCoordinator.createServerConfig(nextSettings),
    );
    expect(harness.serverManager.updateConfig).toHaveBeenNthCalledWith(
      2,
      OpenCodeServiceLifecycleCoordinator.createServerConfig(DEFAULT_SETTINGS),
    );
    expect(harness.serverManager.start).toHaveBeenCalledTimes(1);
    expect(harness.syncEvents.stopSubscription).toHaveBeenNthCalledWith(1, true);
    expect(harness.syncEvents.stopSubscription).toHaveBeenNthCalledWith(2, true);
    expect(harness.openCodeEvents.stopSubscriptions).toHaveBeenNthCalledWith(1, true);
    expect(harness.openCodeEvents.stopSubscriptions).toHaveBeenNthCalledWith(2, true);
    expect(harness.syncEvents.ensureSubscription).toHaveBeenCalledTimes(1);
    expect(harness.openCodeEvents.ensureSubscriptions).toHaveBeenCalledTimes(1);
    expect(harness.getCurrentSettings()).toEqual(DEFAULT_SETTINGS);
    expect(harness.getCurrentBaseUrl()).toBe('http://127.0.0.1:4196');
  });

  it('stops the managed server when switching away from local mode', async () => {
    const harness = createSettingsHarness({
      serverManager: {
        isRunning: jest.fn().mockReturnValue(true),
      },
      syncEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
      openCodeEvents: {
        hasListeners: jest.fn().mockReturnValue(true),
      },
    });
    const nextSettings = cloneSettings(DEFAULT_SETTINGS);
    nextSettings.server.mode = 'remote';
    nextSettings.server.remote.baseUrl = 'https://example.test/opencode';

    await harness.coordinator.updateSettings(nextSettings);

    expect(harness.serverManager.stop).toHaveBeenCalledTimes(1);
    expect(harness.serverManager.restart).not.toHaveBeenCalled();
    expect(harness.serverManager.canBindLocalEndpoint).not.toHaveBeenCalled();
    expect(harness.getCurrentSettings()).toEqual(nextSettings);
    expect(harness.getCurrentBaseUrl()).toBe('https://example.test/opencode');
  });
});
