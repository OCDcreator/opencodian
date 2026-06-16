import { OpencodeConfigManager } from '../../../../src/core/config';
import { OpenCodianSettingsRuntimeCoordinator } from '../../../../src/core/runtime/OpenCodianSettingsRuntimeCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

jest.mock('../../../../src/core/config', () => ({
  ...jest.requireActual('../../../../src/core/config'),
  OpencodeConfigManager: {
    syncPermissionMode: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('OpenCodianSettingsRuntimeCoordinator runtime warmup scheduling', () => {
  function createHost(overrides?: {
    settings?: typeof DEFAULT_SETTINGS;
    vaultBasePath?: string | null;
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
        getVaultBasePath: jest.fn(() => overrides?.vaultBasePath ?? null),
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('does not schedule deferred runtime warmup when OpenCode is enabled but Codex is active', async () => {
    const { host } = createHost({
      settings: {
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
      },
    });
    const coordinator = new OpenCodianSettingsRuntimeCoordinator(host as never);

    coordinator.initialize(true);
    await coordinator.saveSettings();

    expect(host.scheduleDeferredRuntimeWarmup).not.toHaveBeenCalled();
  });
});

describe('OpenCodianSettingsRuntimeCoordinator config sync gating', () => {
  function createHost(overrides?: {
    settings?: typeof DEFAULT_SETTINGS;
    vaultBasePath?: string | null;
  }) {
    let settings = overrides?.settings ?? {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode' as const,
      permissionMode: 'yolo' as const,
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
          getSettingsSnapshot: jest.fn(() => ({ ...DEFAULT_SETTINGS })),
          updateSettings: jest.fn().mockResolvedValue(undefined),
          checkHealth: jest.fn().mockResolvedValue(true),
        })),
        getStorageService: jest.fn(() => ({
          saveCoreSettings: jest.fn().mockResolvedValue(undefined),
          saveUiSettings: jest.fn().mockResolvedValue(undefined),
        })),
        getVaultBasePath: jest.fn(() => {
          const value = overrides?.vaultBasePath;
          return value === null ? null : (value ?? '/vault');
        }),
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncs OpenCode permission config when active backend is OpenCode', async () => {
    const { host } = createHost({
      vaultBasePath: '/vault',
    });
    const coordinator = new OpenCodianSettingsRuntimeCoordinator(host as never);

    coordinator.initialize(true);
    await coordinator.saveSettings();

    expect(OpencodeConfigManager.syncPermissionMode).toHaveBeenCalledWith(
      '/vault',
      'yolo',
      expect.objectContaining({
        healthCheck: expect.any(Function),
      }),
    );
  });

  it('skips OpenCode permission config sync when active backend is Codex', async () => {
    const { host } = createHost({
      vaultBasePath: '/vault',
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode', 'codex'],
        activeBackend: 'codex',
        permissionMode: 'yolo' as const,
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

    expect(OpencodeConfigManager.syncPermissionMode).not.toHaveBeenCalled();
  });

  it('skips OpenCode permission config sync when vault path is null', async () => {
    const { host } = createHost({
      vaultBasePath: null,
    });
    const coordinator = new OpenCodianSettingsRuntimeCoordinator(host as never);

    coordinator.initialize(true);
    await coordinator.saveSettings();

    expect(OpencodeConfigManager.syncPermissionMode).not.toHaveBeenCalled();
  });
});
