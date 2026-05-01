import type { StorageService } from '../../src/core/storage';
import type { Conversation } from '../../src/core/types';
import { OpenCodianView } from '../../src/features/chat/OpenCodianView';
import OpenCodianPlugin from '../../src/main';

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(() => ({ client: 'mock-sdk-client' })),
}), { virtual: true });

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

describe('OpenCodianPlugin.getConversationById', () => {
  it('returns the in-memory conversation when preferCache is enabled', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const conversation: Conversation = {
      id: 'conv-1',
      title: '缓存标题',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
      messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
    };

    plugin.conversations = [conversation];
    plugin.storage = {
      loadFullConversation: jest.fn(),
    } as Pick<StorageService, 'loadFullConversation'>;

    const result = await plugin.getConversationById('conv-1', { preferCache: true });

    expect(result).toBe(conversation);
    expect(plugin.storage.loadFullConversation).not.toHaveBeenCalled();
  });

  it('hydrates the cached conversation from storage by default', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const cachedConversation: Conversation = {
      id: 'conv-1',
      title: '旧标题',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'session-1',
      messages: [],
    };
    const storedConversation: Conversation = {
      ...cachedConversation,
      title: '存储标题',
      messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
    };

    plugin.conversations = [cachedConversation];
    plugin.storage = {
      loadFullConversation: jest.fn().mockResolvedValue(storedConversation),
    } as Pick<StorageService, 'loadFullConversation'>;

    const result = await plugin.getConversationById('conv-1');

    expect(result).toEqual(storedConversation);
    expect(plugin.storage.loadFullConversation).toHaveBeenCalledWith('conv-1');
    expect(plugin.conversations[0]).toEqual(storedConversation);
  });

  it('loads conversation metadata only once across concurrent calls', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'listConversations'>;
    };
    const listConversations = jest.fn().mockResolvedValue([
      {
        id: 'conv-1',
        title: '标题',
        createdAt: 1,
        updatedAt: 2,
        lastResponseAt: 3,
        titleGenerationStatus: 'success',
        openCodeSessionId: 'session-1',
      },
    ]);

    plugin.storage = {
      listConversations,
    } as Pick<StorageService, 'listConversations'>;

    await Promise.all([
      plugin.loadConversations(),
      plugin.loadConversations(),
    ]);

    expect(listConversations).toHaveBeenCalledTimes(1);
    expect(plugin.getConversations()).toEqual([
      expect.objectContaining({
        id: 'conv-1',
        title: '标题',
        openCodeSessionId: 'session-1',
      }),
    ]);
  });
});

describe('OpenCodianPlugin.toggleLiquidDiamondDemoForCurrentView', () => {
  it('activates the view and forwards the toggle to the current OpenCodian view', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      activateView: jest.Mock<Promise<void>, []>;
      getOpenCodianView: () => { toggleLiquidDiamondDemo: jest.Mock } | null;
    };
    const view = {
      toggleLiquidDiamondDemo: jest.fn(),
    };

    plugin.activateView = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(plugin as unknown as { getOpenCodianView: () => typeof view | null }, 'getOpenCodianView')
      .mockReturnValue(view);

    await plugin.toggleLiquidDiamondDemoForCurrentView();

    expect(plugin.activateView).toHaveBeenCalledTimes(1);
    expect(view.toggleLiquidDiamondDemo).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodianPlugin.toggleLiquidDiamondWebGlDemoForCurrentView', () => {
  it('activates the view and forwards the WebGL toggle to the current OpenCodian view', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      activateView: jest.Mock<Promise<void>, []>;
      getOpenCodianView: () => { toggleLiquidDiamondWebGlDemo: jest.Mock } | null;
    };
    const view = {
      toggleLiquidDiamondWebGlDemo: jest.fn(),
    };

    plugin.activateView = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(
        plugin as unknown as {
          getOpenCodianView: () => typeof view | null;
        },
        'getOpenCodianView',
      )
      .mockReturnValue(view);

    await plugin.toggleLiquidDiamondWebGlDemoForCurrentView();

    expect(plugin.activateView).toHaveBeenCalledTimes(1);
    expect(view.toggleLiquidDiamondWebGlDemo).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodianPlugin.toggleGlassOctahedronForCurrentView', () => {
  it('activates the view and forwards the toggle to the current OpenCodian view', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      activateView: jest.Mock<Promise<void>, []>;
      getOpenCodianView: () => {
        toggleGlassOctahedron: jest.Mock<Promise<void>, []>;
      } | null;
    };
    const view = {
      toggleGlassOctahedron: jest.fn().mockResolvedValue(undefined),
    };

    plugin.activateView = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(
        plugin as unknown as {
          getOpenCodianView: () => typeof view | null;
        },
        'getOpenCodianView',
      )
      .mockReturnValue(view);

    await plugin.toggleGlassOctahedronForCurrentView();

    expect(plugin.activateView).toHaveBeenCalledTimes(1);
    expect(view.toggleGlassOctahedron).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodianPlugin.reapplyConversationSessionDefaults', () => {
  it('reapplies session defaults through the current OpenCodian view seam', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      getOpenCodianView: () => {
        reapplyCurrentConversationSessionSettings: jest.Mock<Promise<void>, []>;
      } | null;
    };
    const view: {
      reapplyCurrentConversationSessionSettings: jest.Mock<Promise<void>, []>;
    } = {
      reapplyCurrentConversationSessionSettings: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .spyOn(
        plugin as unknown as {
          getOpenCodianView: () => typeof view | null;
        },
        'getOpenCodianView',
      )
      .mockReturnValue(view);

    await plugin.reapplyConversationSessionDefaults();

    expect(view.reapplyCurrentConversationSessionSettings).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodianPlugin.onload', () => {
  it('runs startup preparation before runtime bootstrap and workspace registration', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin;
    const initialManagedServerState = { pid: 4196 };
    const callOrder: string[] = [];

    jest
      .spyOn(
        plugin as unknown as {
          handlePrepareStartupState: (_coordinator: unknown) => Promise<typeof initialManagedServerState>;
        },
        'handlePrepareStartupState',
      )
      .mockImplementation(async () => {
        callOrder.push('prepare');
        return initialManagedServerState;
      });

    jest
      .spyOn(
        plugin as unknown as {
          handleBootstrapOpenCodeRuntime: (state: typeof initialManagedServerState) => Promise<void>;
        },
        'handleBootstrapOpenCodeRuntime',
      )
      .mockImplementation(async (state) => {
        callOrder.push(`bootstrap:${state === initialManagedServerState}`);
      });

    jest
      .spyOn(
        plugin as unknown as {
          registerWorkspaceIntegration: () => void;
        },
        'registerWorkspaceIntegration',
      )
      .mockImplementation(() => {
        callOrder.push('register');
      });

    await plugin.onload();

    expect(callOrder).toEqual([
      'prepare',
      'bootstrap:true',
      'register',
    ]);
  });
});

describe('OpenCodianPlugin deferred runtime warmup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('defers runtime warmup until after the current tick', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: {
        server: {
          mode: 'local';
          local: { autoStart: boolean };
        };
      };
      openCodeService: { isReady: jest.Mock<boolean, []> };
      scheduleDeferredRuntimeWarmup: () => void;
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };

    plugin.settings = {
      server: {
        mode: 'local',
        local: { autoStart: true },
      },
    };
    plugin.openCodeService = {
      isReady: jest.fn().mockReturnValue(false),
    };
    plugin.startConfiguredLocalServerIfNeeded = jest.fn().mockResolvedValue(undefined);
    plugin.logServerStatusSnapshot = jest.fn().mockResolvedValue(undefined);

    (
      plugin as unknown as {
        runtimeCoordinator: { scheduleDeferredRuntimeWarmup: () => void };
      }
    ).runtimeCoordinator.scheduleDeferredRuntimeWarmup();

    expect(plugin.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(plugin.logServerStatusSnapshot).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.startConfiguredLocalServerIfNeeded).toHaveBeenCalledTimes(1);
    expect(plugin.logServerStatusSnapshot).toHaveBeenCalledWith('deferred-onload');
  });

  it('forces pending warmup to finish before creating a conversation', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: {
        server: {
          mode: 'local';
          local: { autoStart: boolean };
        };
      };
      openCodeService: {
        isReady: jest.Mock<boolean, []>;
        createSession: jest.Mock<Promise<string>, []>;
      };
      conversations: unknown[];
      storage: { saveConversation: jest.Mock<Promise<void>, [unknown]> };
      scheduleDeferredRuntimeWarmup: () => void;
      ensureRuntimeWarmupReadyForSessionBootstrap: () => Promise<void>;
      createConversation: () => Promise<{ openCodeSessionId: string }>;
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };

    plugin.settings = {
      server: {
        mode: 'local',
        local: { autoStart: true },
      },
    };
    plugin.openCodeService = {
      isReady: jest.fn().mockReturnValue(false),
      createSession: jest.fn().mockResolvedValue('session-created'),
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.startConfiguredLocalServerIfNeeded = jest.fn().mockResolvedValue(undefined);
    plugin.logServerStatusSnapshot = jest.fn().mockResolvedValue(undefined);

    (
      plugin as unknown as {
        runtimeCoordinator: { scheduleDeferredRuntimeWarmup: () => void };
      }
    ).runtimeCoordinator.scheduleDeferredRuntimeWarmup();
    const conversation = await plugin.createConversation();

    expect(plugin.startConfiguredLocalServerIfNeeded).toHaveBeenCalledTimes(1);
    expect(plugin.logServerStatusSnapshot).toHaveBeenCalledWith('session-bootstrap');
    expect(plugin.openCodeService.createSession).toHaveBeenCalledTimes(1);
    expect(conversation.openCodeSessionId).toBe('session-created');
  });
});

describe('OpenCodianPlugin.loadSettings', () => {
  it('preserves the inline debug argument serialization toggle from saved settings', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      storage: Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;
    };

    plugin.storage = {
      loadPersistedSettings: jest.fn().mockResolvedValue({
        core: {
          data: {
            inlineSerializedDebugLogArgs: true,
          },
          filePath: '.opencodian/settings.core.json',
          source: 'primary',
          shouldPersist: false,
        },
        ui: {
          data: null,
          filePath: '.opencodian/settings.ui.json',
          source: 'missing',
          shouldPersist: false,
        },
        writable: true,
        shouldPersist: false,
      }),
      saveCoreSettings: jest.fn().mockResolvedValue(undefined),
      saveUiSettings: jest.fn().mockResolvedValue(undefined),
    } as Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;

    await plugin.loadSettings();

    expect(plugin.settings.inlineSerializedDebugLogArgs).toBe(true);
  });

  it('migrates the legacy local default port from 4096 to 4196', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      storage: Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;
    };

    plugin.storage = {
      loadPersistedSettings: jest.fn().mockResolvedValue({
        core: {
          data: {
            server: {
              mode: 'local',
              local: {
                host: '127.0.0.1',
                port: 4096,
                autoStart: true,
              },
              remote: {
                baseUrl: 'http://127.0.0.1:4096',
              },
              auth: {
                type: 'none',
                username: 'opencode',
                password: '',
                token: '',
              },
            },
          },
          filePath: '.opencodian/settings.core.json',
          source: 'primary',
          shouldPersist: false,
        },
        ui: {
          data: null,
          filePath: '.opencodian/settings.ui.json',
          source: 'missing',
          shouldPersist: false,
        },
        writable: true,
        shouldPersist: false,
      }),
      saveCoreSettings: jest.fn().mockResolvedValue(undefined),
      saveUiSettings: jest.fn().mockResolvedValue(undefined),
    } as Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;

    await plugin.loadSettings();

    expect(plugin.settings.server.local.port).toBe(4196);
    expect(plugin.settings.server.remote.baseUrl).toBe('http://127.0.0.1:4096');
    expect(plugin.storage.saveCoreSettings).toHaveBeenCalled();
  });
});

describe('OpenCodianPlugin slash command catalog invalidation', () => {
  it('invalidates slash command catalogs after settings are saved', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: Record<string, unknown>;
      persistSettingsDomains: jest.Mock<Promise<void>, [unknown]>;
      runtimeCoordinator: {
        refreshOpenCodianViews: jest.Mock<void, [unknown]>;
        invalidateSlashCommandMenuCatalogs: jest.Mock<void, []>;
      };
    };

    plugin.settings = {};
    plugin.persistSettingsDomains = jest.fn().mockResolvedValue(undefined);
    plugin.runtimeCoordinator = {
      refreshOpenCodianViews: jest.fn(),
      invalidateSlashCommandMenuCatalogs: jest.fn(),
    };

    jest
      .spyOn(
        plugin as unknown as {
          clearChatAppearanceSaveTimer: () => void;
        },
        'clearChatAppearanceSaveTimer',
      )
      .mockImplementation(() => {});
    jest
      .spyOn(
        plugin as unknown as {
          clearSettingsUiStateSaveTimer: () => void;
        },
        'clearSettingsUiStateSaveTimer',
      )
      .mockImplementation(() => {});
    jest
      .spyOn(
        plugin as unknown as {
          applyLoggerSettings: () => void;
        },
        'applyLoggerSettings',
      )
      .mockImplementation(() => {});

    await plugin.saveSettings({
      syncService: false,
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });

    expect(plugin.persistSettingsDomains).toHaveBeenCalledWith({ core: true, ui: true });
    expect(plugin.runtimeCoordinator.refreshOpenCodianViews).toHaveBeenCalledWith({ reloadModels: false, applyUi: false });
    expect(plugin.runtimeCoordinator.invalidateSlashCommandMenuCatalogs).toHaveBeenCalledTimes(1);
  });

  it('forwards slash command cache invalidation to open OpenCodian views', () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      app: {
        workspace: {
          getLeavesOfType: jest.Mock<Array<{ view: unknown }>, [string]>;
        };
      };
    };
    const openCodianView = Object.assign(Object.create(OpenCodianView.prototype), {
      invalidateSlashCommandMenuCatalog: jest.fn(),
    });

    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([
          { view: {} },
          { view: openCodianView },
        ]),
      },
    };

    (
      plugin as unknown as {
        runtimeCoordinator: { invalidateSlashCommandMenuCatalogs: (options?: { preload?: boolean }) => void };
      }
    ).runtimeCoordinator.invalidateSlashCommandMenuCatalogs({ preload: true });

    expect(openCodianView.invalidateSlashCommandMenuCatalog).toHaveBeenCalledWith({ preload: true });
  });

  it('warms slash command catalogs when the server becomes running', () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settingsTab: { refreshServerStatusDisplay: jest.Mock<void, []> } | null;
      runtimeCoordinator: { invalidateSlashCommandMenuCatalogs: jest.Mock<void, [options?: { preload?: boolean }]> };
    };

    plugin.settingsTab = {
      refreshServerStatusDisplay: jest.fn(),
    };
    plugin.runtimeCoordinator = {
      invalidateSlashCommandMenuCatalogs: jest.fn(),
    };

    (
      plugin as unknown as {
        handleOpenCodeServerStatusChange: (status: string) => void;
      }
    ).handleOpenCodeServerStatusChange('running');

    expect(plugin.settingsTab.refreshServerStatusDisplay).toHaveBeenCalledTimes(1);
    expect(plugin.runtimeCoordinator.invalidateSlashCommandMenuCatalogs).toHaveBeenCalledWith({ preload: true });
  });
});
