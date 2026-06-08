import { OpenCodianSettingsRuntimeCoordinator } from '../../../../src/core/runtime/OpenCodianSettingsRuntimeCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

describe('OpenCodianSettingsRuntimeCoordinator runtime warmup scheduling', () => {
  function createHost(overrides?: {
    settings?: typeof DEFAULT_SETTINGS;
  }) {
    let settings = overrides?.settings ?? {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode' as const,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'local' as const,
        local: {
          ...DEFAULT_SETTINGS.server.local,
          autoStart: true,
        },
      },
    };

    return {
      host: {
        getSettings: jest.fn(() => settings),
        setSettings: jest.fn((nextSettings) => {
          settings = nextSettings;
        }),
        getOpenCodeService: jest.fn(() => ({
          getSettingsSnapshot: jest.fn(() => ({
            ...DEFAULT_SETTINGS,
            server: {
              ...DEFAULT_SETTINGS.server,
              mode: 'remote' as const,
            },
          })),
          updateSettings: jest.fn().mockResolvedValue(undefined),
          checkHealth: jest.fn().mockResolvedValue(true),
        })),
        getStorageService: jest.fn(() => ({
          saveCoreSettings: jest.fn().mockResolvedValue(undefined),
          saveUiSettings: jest.fn().mockResolvedValue(undefined),
        })),
        getVaultBasePath: jest.fn(() => null),
        refreshOpenCodianViews: jest.fn(),
        invalidateSlashCommandMenuCatalogs: jest.fn(),
        applyProviderIconColorMode: jest.fn(),
        getOpenCodianLeaves: jest.fn(() => []),
        onSettingsPersistenceBlocked: jest.fn(),
        scheduleDeferredRuntimeWarmup: jest.fn(),
      },
      getSettingsRef: () => settings,
    };
  }

  it('schedules deferred runtime warmup after saveSettings enables local auto-started OpenCode', async () => {
    const { host } = createHost();
    const coordinator = new OpenCodianSettingsRuntimeCoordinator(host as never);

    coordinator.initialize(true);
    await coordinator.saveSettings();

    expect(host.scheduleDeferredRuntimeWarmup).toHaveBeenCalledTimes(1);
  });

  it('does not schedule deferred runtime warmup when no backend is enabled', async () => {
    const { host } = createHost({
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: [],
        activeBackend: undefined,
        server: {
          ...DEFAULT_SETTINGS.server,
          mode: 'local',
          local: {
            ...DEFAULT_SETTINGS.server.local,
            autoStart: true,
          },
        },
      },
    });
    const coordinator = new OpenCodianSettingsRuntimeCoordinator(host as never);

    coordinator.initialize(true);
    await coordinator.saveSettings();

    expect(host.scheduleDeferredRuntimeWarmup).not.toHaveBeenCalled();
  });
});
