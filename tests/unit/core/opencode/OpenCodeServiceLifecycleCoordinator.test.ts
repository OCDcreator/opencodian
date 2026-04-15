import {
  OpenCodeServiceLifecycleCoordinator,
  type OpenCodeServiceLifecycleCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeServiceLifecycleCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createHost(
  overrides: Partial<OpenCodeServiceLifecycleCoordinatorHost> = {},
): jest.Mocked<OpenCodeServiceLifecycleCoordinatorHost> {
  const host = {
    getSettings: jest.fn(() => DEFAULT_SETTINGS),
    getBaseUrl: jest.fn(() => 'http://127.0.0.1:4096'),
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
    },
    syncEvents: {
      ensureSubscription: jest.fn(),
      stopSubscription: jest.fn(),
      restartSubscription: jest.fn(),
    },
    openCodeEvents: {
      ensureSubscriptions: jest.fn(),
      stopSubscriptions: jest.fn(),
      restartSubscriptions: jest.fn(),
    },
    ...overrides,
  };

  return host as unknown as jest.Mocked<OpenCodeServiceLifecycleCoordinatorHost>;
}

describe('OpenCodeServiceLifecycleCoordinator', () => {
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
      },
    });
    const coordinator = new OpenCodeServiceLifecycleCoordinator(host);

    await expect(coordinator.checkHealth()).resolves.toBe(true);

    expect(host.logHealthProbeFallback).toHaveBeenCalledWith(sdkError);
    expect(host.serverManager.checkHealth).toHaveBeenCalledWith(3000);
    expect(host.resetTransientConnectivityLogState).toHaveBeenCalledTimes(1);
  });
});
