import * as obsidian from 'obsidian';

import { PluginRuntimeCoordinator } from '../../../../src/app/runtime/PluginRuntimeCoordinator';
import type { OpenCodianSettings } from '../../../../src/core/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

function createWarmupHost(settings: OpenCodianSettings) {
  return {
    getSettings: jest.fn(() => settings),
    getOpenCodeService: jest.fn(() => ({
      isReady: jest.fn(() => false),
    })),
    getPluginUpdateService: jest.fn(() => null),
    getPluginVersion: jest.fn(() => '1.0.0'),
    getOpenCodianLeaves: jest.fn(() => []),
    hasEnabledBackend: jest.fn((backendId: string) => settings.enabledBackends.includes(backendId as never)),
    applyProviderIconColorMode: jest.fn(),
    startConfiguredLocalServerIfNeeded: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    onModelsLoaded: jest.fn(),
  };
}

describe('PluginRuntimeCoordinator deferred runtime warmup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not probe OpenCode health when OpenCode is enabled but another backend is active', async () => {
    const settings: OpenCodianSettings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode', 'codex'],
      activeBackend: 'codex',
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'local',
        local: {
          ...DEFAULT_SETTINGS.server.local,
          autoStart: true,
        },
      },
    };
    const host = createWarmupHost(settings);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    coordinator.scheduleDeferredRuntimeWarmup();
    await jest.runOnlyPendingTimersAsync();

    expect(host.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(host.logServerStatusSnapshot).not.toHaveBeenCalled();
  });
});

describe('PluginRuntimeCoordinator plugin update startup check', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifies once for a newly discovered compatible stable version', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS };
    const host = createWarmupHost(settings);
    const markVersionNotified = jest.fn(async (version: string) => {
      settings.pluginUpdateState.lastNotifiedVersion = version;
    });
    host.getPluginUpdateService.mockReturnValue({
      checkForUpdates: jest.fn().mockResolvedValue({
        status: 'ready',
        latestRelease: { version: '1.1.0', installable: true },
      }),
      markVersionNotified,
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();
    await coordinator.checkPluginUpdateOnStartup();

    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(markVersionNotified).toHaveBeenCalledWith('1.1.0');
  });
});

describe('PluginRuntimeCoordinator plugin update auto-install', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createAutoInstallHost(settings: OpenCodianSettings, latestVersion = '1.1.0') {
    const host = createWarmupHost(settings);
    const installNewestInstallable = jest.fn().mockResolvedValue({
      previousVersion: '1.0.0',
      installedVersion: latestVersion,
      source: 'github',
    });
    const markVersionNotified = jest.fn(async (version: string) => {
      settings.pluginUpdateState.lastNotifiedVersion = version;
    });
    host.getPluginUpdateService.mockReturnValue({
      checkForUpdates: jest.fn().mockResolvedValue({
        status: 'ready',
        latestRelease: { version: latestVersion, installable: true },
      }),
      installNewestInstallable,
      markVersionNotified,
    });
    return { host, installNewestInstallable, markVersionNotified };
  }

  it('installs a newer compatible release automatically when auto-install is enabled', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS, pluginUpdateAutoInstall: true };
    const { host, installNewestInstallable, markVersionNotified } = createAutoInstallHost(settings);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(installNewestInstallable).toHaveBeenCalledTimes(1);
    expect(markVersionNotified).toHaveBeenCalledWith('1.1.0');
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(String(noticeSpy.mock.calls[0][0])).toContain('1.1.0');
  });

  it('auto-installs even when the version was already notified manually', async () => {
    const settings: OpenCodianSettings = {
      ...DEFAULT_SETTINGS,
      pluginUpdateAutoInstall: true,
      pluginUpdateState: { ...DEFAULT_SETTINGS.pluginUpdateState, lastNotifiedVersion: '1.1.0' },
    };
    const { host, installNewestInstallable } = createAutoInstallHost(settings);
    jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(installNewestInstallable).toHaveBeenCalledTimes(1);
  });

  it('keeps the current version and surfaces the error when auto-install fails', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS, pluginUpdateAutoInstall: true };
    const { host, installNewestInstallable, markVersionNotified } = createAutoInstallHost(settings);
    installNewestInstallable.mockRejectedValue(new Error('download failed'));
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(String(noticeSpy.mock.calls[0][0])).toContain('download failed');
    expect(markVersionNotified).not.toHaveBeenCalled();
  });

  it('stays silent when no newer installable release remains', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS, pluginUpdateAutoInstall: true };
    const { host, installNewestInstallable, markVersionNotified } = createAutoInstallHost(settings);
    installNewestInstallable.mockResolvedValue(null);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(noticeSpy).not.toHaveBeenCalled();
    expect(markVersionNotified).not.toHaveBeenCalled();
  });

  it('does not install when the latest release is not newer than the running version', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS, pluginUpdateAutoInstall: true };
    const { host, installNewestInstallable } = createAutoInstallHost(settings, '0.9.9');
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(installNewestInstallable).not.toHaveBeenCalled();
    expect(noticeSpy).not.toHaveBeenCalled();
  });

  it('does not install when the latest release is not installable', async () => {
    const settings: OpenCodianSettings = { ...DEFAULT_SETTINGS, pluginUpdateAutoInstall: true };
    const { host, installNewestInstallable } = createAutoInstallHost(settings);
    host.getPluginUpdateService.mockReturnValue({
      checkForUpdates: jest.fn().mockResolvedValue({
        status: 'ready',
        latestRelease: { version: '1.1.0', installable: false },
      }),
      installNewestInstallable,
      markVersionNotified: jest.fn(),
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    await coordinator.checkPluginUpdateOnStartup();

    expect(installNewestInstallable).not.toHaveBeenCalled();
    expect(noticeSpy).not.toHaveBeenCalled();
  });
});
