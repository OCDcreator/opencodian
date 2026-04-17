import type { StorageService } from '../../src/core/storage';
import type { Conversation } from '../../src/core/types';
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
          prepareStartupState: () => Promise<typeof initialManagedServerState>;
        },
        'prepareStartupState',
      )
      .mockImplementation(async () => {
        callOrder.push('prepare');
        return initialManagedServerState;
      });

    jest
      .spyOn(
        plugin as unknown as {
          bootstrapOpenCodeRuntime: (state: typeof initialManagedServerState) => Promise<void>;
        },
        'bootstrapOpenCodeRuntime',
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
