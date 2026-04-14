import {
  OpenCodeSettingsReconfigurationCoordinator,
  type OpenCodeSettingsReconfigurationCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeSettingsReconfigurationCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { OpenCodianSettings } from '../../../../src/core/types/settings';
import { getServerBaseUrl } from '../../../../src/core/types/settings';

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
}

function createHarness(
  overrides: Partial<{
    serverManager: Partial<OpenCodeSettingsReconfigurationCoordinatorHost['serverManager']>;
    syncEvents: Partial<OpenCodeSettingsReconfigurationCoordinatorHost['syncEvents']>;
    openCodeEvents: Partial<OpenCodeSettingsReconfigurationCoordinatorHost['openCodeEvents']>;
  }> = {},
) {
  let currentSettings = cloneSettings(DEFAULT_SETTINGS);
  let currentBaseUrl = getServerBaseUrl(currentSettings.server);

  const serverManager = {
    isRunning: jest.fn().mockReturnValue(false),
    updateConfig: jest.fn(),
    canBindLocalEndpoint: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(undefined),
    restart: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    ...overrides.serverManager,
  };

  const syncEvents = {
    hasListeners: jest.fn().mockReturnValue(false),
    stopSubscription: jest.fn(),
    ensureSubscription: jest.fn(),
    ...overrides.syncEvents,
  };

  const openCodeEvents = {
    hasListeners: jest.fn().mockReturnValue(false),
    stopSubscriptions: jest.fn(),
    ensureSubscriptions: jest.fn(),
    ...overrides.openCodeEvents,
  };

  const host: OpenCodeSettingsReconfigurationCoordinatorHost = {
    getCurrentSettings: () => currentSettings,
    setCurrentSettings: (settings) => {
      currentSettings = settings;
    },
    getCurrentBaseUrl: () => currentBaseUrl,
    setCurrentBaseUrl: (baseUrl) => {
      currentBaseUrl = baseUrl;
    },
    getToolCatalogScopeKey: jest.fn(() => `${currentBaseUrl}::`),
    clearToolSchemaCacheIfScopeChanged: jest.fn(),
    serverManager,
    syncEvents,
    openCodeEvents,
  };

  return {
    coordinator: new OpenCodeSettingsReconfigurationCoordinator(host),
    host,
    serverManager,
    syncEvents,
    openCodeEvents,
    getCurrentSettings: () => currentSettings,
    getCurrentBaseUrl: () => currentBaseUrl,
  };
}

describe('OpenCodeSettingsReconfigurationCoordinator', () => {
  it('restarts the managed server when local runtime settings change', async () => {
    const harness = createHarness({
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
      OpenCodeSettingsReconfigurationCoordinator.createServerConfig(nextSettings),
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
    const harness = createHarness({
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
      OpenCodeSettingsReconfigurationCoordinator.createServerConfig(nextSettings),
    );
    expect(harness.serverManager.updateConfig).toHaveBeenNthCalledWith(
      2,
      OpenCodeSettingsReconfigurationCoordinator.createServerConfig(DEFAULT_SETTINGS),
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
    const harness = createHarness({
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
