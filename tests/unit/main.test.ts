/* eslint-disable max-lines */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AgentCapability } from '../../src/core/agents/AgentCapability';
import { ClaudeCodeAdapter, type ClaudeCodeSdkFacade } from '../../src/core/agents/backend';
import { AgentServiceRegistry } from '../../src/core/agents/backend/AgentServiceRegistry';
import type { StorageService } from '../../src/core/storage';
import { type Conversation, DEFAULT_SETTINGS } from '../../src/core/types';
import { OpenCodianView } from '../../src/features/chat/OpenCodianView';
import OpenCodianPlugin from '../../src/main';
import { sanitizeDiagnosticReport } from '../../src/shared';

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(() => ({ client: 'mock-sdk-client' })),
}), { virtual: true });

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

function createConversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    updatedAt: Number(id.replace(/\D/g, '')) || 1,
    openCodeSessionId: `session-${id}`,
    messages: [{ id: `message-${id}`, role: 'user', content: `message ${id}`, timestamp: 1 }],
    ...overrides,
  };
}

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

describe('OpenCodianPlugin unload diagnostics', () => {
  it('main.ts onunload delegates trace disposal to DiagnosticsRuntimeCoordinator (no inline per-service disposal)', () => {
    // After Phase 3 Task 11, main.ts no longer disposes trace services inline;
    // it calls this.diagnosticsCoordinator?.dispose(). The per-backend warning
    // behavior (fail-closed, no secret/path leak) is owned and tested by the
    // dedicated DiagnosticsRuntimeCoordinator.test.ts.
    const plugin = new OpenCodianPlugin() as unknown as {
      onunload(): void;
      runtimeCoordinator: { dispose: jest.Mock };
      diagnosticsCoordinator?: { dispose: jest.Mock };
      getSettingsRuntimeCoordinator: jest.Mock<{ clearChatAppearanceSaveTimer: jest.Mock }, []>;
    };
    const coordinatorDispose = jest.fn();
    plugin.runtimeCoordinator = { dispose: jest.fn() };
    plugin.diagnosticsCoordinator = { dispose: coordinatorDispose };
    plugin.getSettingsRuntimeCoordinator = jest.fn(() => ({ clearChatAppearanceSaveTimer: jest.fn() }));
    plugin.onunload();
    expect(coordinatorDispose).toHaveBeenCalled();
  });

  it('trace-service getters return undefined before bootstrap (preserves prior optional-chaining safety)', () => {
    // The prior stored fields were uninitialized before bootstrap, so reads
    // returned undefined and `this.plugin.openCodeTraceService?.store` was safe.
    // The delegating getters must preserve this (return undefined, not throw).
    const plugin = new OpenCodianPlugin() as unknown as {
      openCodeTraceService?: unknown;
      codexTraceService?: unknown;
      claudeTraceService?: unknown;
      diagnosticsCoordinator: null;
    };
    plugin.diagnosticsCoordinator = null;
    expect(plugin.openCodeTraceService).toBeUndefined();
    expect(plugin.codexTraceService).toBeUndefined();
    expect(plugin.claudeTraceService).toBeUndefined();
  });
});

describe('OpenCodianPlugin conversation full-message cache', () => {
  it('trims unpinned full-message conversations after loading over the cache limit', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const storedConversations = new Map<string, Conversation>();

    plugin.conversations = Array.from({ length: 13 }, (_, index) => {
      const id = `conv-${index + 1}`;
      const conversation = createConversation(id);
      storedConversations.set(id, conversation);
      return { ...conversation, messages: [] };
    });
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) => storedConversations.get(id)),
    } as Pick<StorageService, 'loadFullConversation'>;

    for (const conversation of plugin.conversations) {
      await plugin.getConversationById(conversation.id);
    }

    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(0);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-2')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-13')?.messages).toHaveLength(1);
  });

  it('does not trim pinned full-message conversations', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const storedConversations = new Map<string, Conversation>();
    const pinAllProvider = () => plugin.conversations.map((conversation) => conversation.id);

    plugin.conversations = Array.from({ length: 13 }, (_, index) => {
      const id = `conv-${index + 1}`;
      const conversation = createConversation(id);
      storedConversations.set(id, conversation);
      return { ...conversation, messages: [] };
    });
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) => storedConversations.get(id)),
    } as Pick<StorageService, 'loadFullConversation'>;
    plugin.registerConversationCachePinProvider(pinAllProvider);

    for (const conversation of plugin.conversations) {
      await plugin.getConversationById(conversation.id);
    }

    expect(plugin.conversations.every((conversation) => conversation.messages.length === 1)).toBe(true);

    plugin.unregisterConversationCachePinProvider(pinAllProvider);

    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(0);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-13')?.messages).toHaveLength(1);
  });

  it('trims immediately when a pin provider is registered', () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
    };

    plugin.conversations = Array.from({ length: 13 }, (_, index) => createConversation(`conv-${index + 1}`));

    plugin.registerConversationCachePinProvider(() => ['conv-1']);

    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-2')?.messages).toHaveLength(0);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-13')?.messages).toHaveLength(1);
  });

  it('aggregates pinned conversations from multiple views and supports unregister', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const storedConversations = new Map<string, Conversation>();
    const providerA = () => ['conv-1', '', null as unknown as string];
    const providerB = () => ['conv-2'];

    plugin.conversations = Array.from({ length: 14 }, (_, index) => {
      const id = `conv-${index + 1}`;
      const conversation = createConversation(id);
      storedConversations.set(id, conversation);
      return { ...conversation, messages: [] };
    });
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) => storedConversations.get(id)),
    } as Pick<StorageService, 'loadFullConversation'>;
    plugin.registerConversationCachePinProvider(providerA);
    plugin.registerConversationCachePinProvider(providerB);

    for (const conversation of plugin.conversations) {
      await plugin.getConversationById(conversation.id);
    }

    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-2')?.messages).toHaveLength(1);

    plugin.unregisterConversationCachePinProvider(providerA);
    await plugin.getConversationById('conv-3');

    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(0);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-2')?.messages).toHaveLength(1);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-3')?.messages).toHaveLength(1);
  });

  it('rehydrates an evicted conversation when requested again', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation'>;
    };
    const storedConversations = new Map<string, Conversation>();

    plugin.conversations = Array.from({ length: 13 }, (_, index) => {
      const id = `conv-${index + 1}`;
      const conversation = createConversation(id);
      storedConversations.set(id, conversation);
      return { ...conversation, messages: [] };
    });
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) => storedConversations.get(id)),
    } as Pick<StorageService, 'loadFullConversation'>;

    for (const conversation of plugin.conversations) {
      await plugin.getConversationById(conversation.id);
    }
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(0);

    const result = await plugin.getConversationById('conv-1');

    expect(result?.messages).toHaveLength(1);
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')?.messages).toHaveLength(1);
    expect(plugin.storage.loadFullConversation).toHaveBeenCalledWith('conv-1');
  });
});

describe('OpenCodianPlugin conversation save full-message guard', () => {
  it('reloads full messages before saving an evicted metadata-only conversation', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;
    };
    const storedConversations = new Map<string, Conversation>();

    plugin.conversations = Array.from({ length: 13 }, (_, index) => {
      const id = `conv-${index + 1}`;
      const conversation = createConversation(id);
      storedConversations.set(id, conversation);
      return { ...conversation, messages: [] };
    });
    plugin.storage = {
      loadFullConversation: jest.fn(async (id: string) => storedConversations.get(id)),
      saveConversation: jest.fn().mockResolvedValue(undefined),
    } as Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;

    for (const conversation of plugin.conversations) {
      await plugin.getConversationById(conversation.id);
    }

    await plugin.saveConversation({
      ...createConversation('conv-1', {
        messages: [],
        title: 'Metadata title',
        updatedAt: 99,
        lastResponseAt: 100,
        titleGenerationStatus: 'success',
        currentNote: 'note.md',
        externalContextPaths: ['context.md'],
        sessionSettings: { model: 'anthropic/claude-sonnet-4-5' },
        backgroundTaskMetadata: {
          activeAnchor: {
            startedAt: 1,
            anchorKey: 'anchor',
            modeTag: 'mode',
            waitingForFollowUp: false,
            updatedAt: 2,
          },
        },
      }),
    });

    const savedConversation = (plugin.storage.saveConversation as jest.Mock).mock.calls[0][0] as Conversation;
    expect(savedConversation.messages).toHaveLength(1);
    expect(savedConversation).toEqual(expect.objectContaining({
      title: 'Metadata title',
      updatedAt: 99,
      lastResponseAt: 100,
      titleGenerationStatus: 'success',
      currentNote: 'note.md',
      externalContextPaths: ['context.md'],
      sessionSettings: { model: 'anthropic/claude-sonnet-4-5' },
      backgroundTaskMetadata: {
        activeAnchor: {
          startedAt: 1,
          anchorKey: 'anchor',
          modeTag: 'mode',
          waitingForFollowUp: false,
          updatedAt: 2,
        },
      },
    }));
    expect(plugin.conversations.find((conversation) => conversation.id === 'conv-1')).toEqual(savedConversation);
  });

  it('reloads full messages before saving a startup metadata-only conversation', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      conversations: Conversation[];
      storage: Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;
    };
    const fullConversation = createConversation('conv-1', {
      title: 'Stored title',
      messages: [
        { id: 'message-1', role: 'user', content: 'preserve me', timestamp: 1 },
      ],
    });
    const metadataOnly = {
      ...fullConversation,
      title: 'Updated title',
      updatedAt: 42,
      messages: [],
    };

    plugin.conversations = [metadataOnly];
    plugin.storage = {
      loadFullConversation: jest.fn().mockResolvedValue(fullConversation),
      saveConversation: jest.fn().mockResolvedValue(undefined),
    } as Pick<StorageService, 'loadFullConversation' | 'saveConversation'>;

    await plugin.saveConversation(metadataOnly);

    expect(plugin.storage.loadFullConversation).toHaveBeenCalledWith('conv-1');
    expect(plugin.storage.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Updated title',
      updatedAt: 42,
      messages: fullConversation.messages,
    }));
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

describe('OpenCodianPlugin.startNewConversationForCurrentView', () => {
  it('activates the chat view and opens a new conversation in the current view', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      activateView: jest.Mock<Promise<void>, []>;
      getOpenCodianView: () => { createConversationInCurrentTab: jest.Mock<Promise<void>, []> } | null;
    };
    const view = {
      createConversationInCurrentTab: jest.fn().mockResolvedValue(undefined),
    };

    plugin.activateView = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(plugin as unknown as { getOpenCodianView: () => typeof view | null }, 'getOpenCodianView')
      .mockReturnValue(view);

    await plugin.startNewConversationForCurrentView();

    expect(plugin.activateView).toHaveBeenCalledTimes(1);
    expect(view.createConversationInCurrentTab).toHaveBeenCalledTimes(1);
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

describe('OpenCodianPlugin backend bootstrap', () => {
  it('registers Claude Code and restores it as the active backend from settings', async () => {
    const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-bootstrap-'));
    const claudePath = path.join(vaultPath, 'bin', 'claude');
    fs.mkdirSync(path.dirname(claudePath), { recursive: true });
    fs.writeFileSync(claudePath, '#!/bin/sh\n');
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      app: {
        vault: { adapter: { basePath: string } };
        workspace: { getLeavesOfType: jest.Mock<unknown[], [string]> };
      };
      settings: typeof DEFAULT_SETTINGS;
      storage: Pick<StorageService, 'saveManagedServerState' | 'listConversations'>;
      loadConversations: jest.Mock<Promise<void>, []>;
      configureVaultScopedServices: jest.Mock<void, []>;
    };

    plugin.app = {
      vault: { adapter: { basePath: vaultPath } },
      workspace: { getLeavesOfType: jest.fn().mockReturnValue([]) },
    };
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode', 'claude-code'],
      activeBackend: 'claude-code',
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        claudeCode: {
          ...DEFAULT_SETTINGS.backendSettings.claudeCode,
          executablePath: claudePath,
        },
      },
    };
    plugin.storage = {
      saveManagedServerState: jest.fn().mockResolvedValue(undefined),
      listConversations: jest.fn().mockResolvedValue([]),
    } as Pick<StorageService, 'saveManagedServerState' | 'listConversations'>;
    plugin.loadConversations = jest.fn().mockResolvedValue(undefined);
    plugin.configureVaultScopedServices = jest.fn();

    await (
      plugin as unknown as {
        handleBootstrapOpenCodeRuntime: (initialManagedServerState: null) => Promise<void>;
      }
    ).handleBootstrapOpenCodeRuntime(null);

    expect(plugin.agentServiceRegistry.get('opencode')).toBeDefined();
    const claudeAdapter = plugin.agentServiceRegistry.get('claude-code') as ClaudeCodeAdapter & {
      options: { pathToClaudeCodeExecutable?: string };
    };
    expect(claudeAdapter).toBeDefined();
    expect(claudeAdapter.options.pathToClaudeCodeExecutable).toBe(claudePath);
    expect(plugin.agentServiceRegistry.getActiveKind()).toBe('claude-code');
    expect(plugin.claudeCodePermissionBridge).toBeDefined();
    expect(plugin.claudeCodePermissionHostContext).toBeDefined();
    expect(typeof plugin.claudeCodePermissionHostContext.getActiveTabId).toBe('function');
  });
});

// eslint-disable-next-line max-lines-per-function -- Deferred warmup cases share plugin bootstrap fixtures and backend-routing assertions.
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
        enabledBackends?: string[];
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
      enabledBackends: ['opencode'],
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

  it('skips deferred runtime warmup when no backend is enabled', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: {
        enabledBackends: string[];
        server: {
          mode: 'local';
          local: { autoStart: boolean };
        };
      };
      openCodeService: { isReady: jest.Mock<boolean, []> };
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };

    plugin.settings = {
      enabledBackends: [],
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

    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(plugin.logServerStatusSnapshot).not.toHaveBeenCalled();
  });

  it('forces pending warmup to finish before creating a conversation', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: {
        enabledBackends?: string[];
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
      enabledBackends: ['opencode'],
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

  it('does not force session-bootstrap warmup when no backend is enabled', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: {
        enabledBackends: string[];
        activeBackend?: string;
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
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };

    plugin.settings = {
      enabledBackends: [],
      activeBackend: 'opencode',
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

    await expect(plugin.createConversation()).rejects.toThrow('opencode backend is not enabled');

    expect(plugin.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(plugin.logServerStatusSnapshot).not.toHaveBeenCalled();
    expect(plugin.openCodeService.createSession).not.toHaveBeenCalled();
  });

  it('creates Claude conversations through the active session backend without OpenCode warmup', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      agentServiceRegistry: AgentServiceRegistry;
      openCodeService: {
        createSession: jest.Mock<Promise<string>, []>;
      };
      conversations: Conversation[];
      storage: { saveConversation: jest.Mock<Promise<void>, [Conversation]> };
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };
    const sdk: ClaudeCodeSdkFacade = {
      query: jest.fn(() => (async function* () {})()),
    };
    const claudeAdapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: DEFAULT_SETTINGS.backendSettings.claudeCode,
      sdk,
    });

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['claude-code'],
      activeBackend: 'claude-code',
    };
    plugin.agentServiceRegistry = new AgentServiceRegistry();
    plugin.agentServiceRegistry.register(claudeAdapter);
    plugin.agentServiceRegistry.setEnabledBackends(['claude-code']);
    plugin.openCodeService = {
      createSession: jest.fn().mockResolvedValue('opencode-session'),
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.startConfiguredLocalServerIfNeeded = jest.fn().mockResolvedValue(undefined);
    plugin.logServerStatusSnapshot = jest.fn().mockResolvedValue(undefined);

    const conversation = await plugin.createConversation();

    expect(plugin.openCodeService.createSession).not.toHaveBeenCalled();
    expect(plugin.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(conversation.backend).toBe('claude-code');
    expect(conversation.openCodeSessionId).toBeUndefined();
    expect(conversation.backendSessionId).toMatch(/^claude-code-/);
    expect(plugin.storage.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('does not fall back to OpenCode when the registered Claude backend lacks createSession', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      agentServiceRegistry: AgentServiceRegistry;
      openCodeService: {
        isReady: jest.Mock<boolean, []>;
        createSession: jest.Mock<Promise<string>, []>;
      };
      conversations: Conversation[];
      storage: { saveConversation: jest.Mock<Promise<void>, [Conversation]> };
      startConfiguredLocalServerIfNeeded: jest.Mock<Promise<void>, []>;
      logServerStatusSnapshot: jest.Mock<Promise<void>, [string?]>;
    };
    const opencodeCreateSession = jest.fn().mockResolvedValue('opencode-session');
    const malformedClaudeSessionAdapter = {
      kind: 'claude-code' as const,
      displayName: 'Claude Code',
      description: 'Malformed Claude Code adapter without createSession',
      status: 'connected' as const,
      capabilities: new Set([AgentCapability.Sessions]),
      hasCapability: jest.fn((cap: AgentCapability) => cap === AgentCapability.Sessions),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      onStatusChange: jest.fn(() => ({ dispose: jest.fn() })),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      updateSessionTitle: jest.fn().mockResolvedValue(undefined),
    };

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode', 'claude-code'],
      activeBackend: 'claude-code',
    };
    plugin.agentServiceRegistry = new AgentServiceRegistry();
    plugin.agentServiceRegistry.register({
      kind: 'opencode',
      displayName: 'OpenCode',
      description: 'OpenCode test adapter',
      status: 'connected',
      capabilities: new Set([AgentCapability.Sessions]),
      hasCapability: jest.fn((cap: AgentCapability) => cap === AgentCapability.Sessions),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      onStatusChange: jest.fn(() => ({ dispose: jest.fn() })),
      createSession: opencodeCreateSession,
      deleteSession: jest.fn().mockResolvedValue(undefined),
      updateSessionTitle: jest.fn().mockResolvedValue(undefined),
    });
    plugin.agentServiceRegistry.register(malformedClaudeSessionAdapter);
    plugin.agentServiceRegistry.setEnabledBackends(['opencode', 'claude-code']);
    plugin.openCodeService = {
      isReady: jest.fn().mockReturnValue(true),
      createSession: jest.fn().mockResolvedValue('opencode-session'),
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.startConfiguredLocalServerIfNeeded = jest.fn().mockResolvedValue(undefined);
    plugin.logServerStatusSnapshot = jest.fn().mockResolvedValue(undefined);

    await expect(plugin.createConversation()).rejects.toThrow(
      'Cannot create conversation: active backend does not support sessions',
    );

    expect(opencodeCreateSession).not.toHaveBeenCalled();
    expect(plugin.openCodeService.createSession).not.toHaveBeenCalled();
    expect(plugin.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(plugin.logServerStatusSnapshot).not.toHaveBeenCalled();
    expect(plugin.storage.saveConversation).not.toHaveBeenCalled();
    expect(plugin.conversations).toEqual([]);
  });

  it('sanitizes diagnostic reports before export', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      app: typeof OpenCodianPlugin.prototype.app;
      openCodeService: {
        checkHealth: jest.Mock<Promise<boolean>, []>;
        getServerStatus: jest.Mock<string, []>;
        isServerProcessRunning: jest.Mock<boolean, []>;
        getServerDiagnostics: jest.Mock<Record<string, unknown>, []>;
      };
      startupCoordinator: { getStartupPerfSummaryLines: jest.Mock<string[], []>; getStartupPerformanceDiagnosisLines: jest.Mock<string[], []> };
      manifest: { name: string; id: string; version: string };
    };

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        claudeCode: {
          ...DEFAULT_SETTINGS.backendSettings.claudeCode,
          debugChannels: {
            ...DEFAULT_SETTINGS.backendSettings.claudeCode.debugChannels,
            runtime: true,
          },
        },
      },
    };
    plugin.app = {
      vault: {
        adapter: {
          basePath: '/vault',
        },
      },
    } as typeof OpenCodianPlugin.prototype.app;
    plugin.openCodeService = {
      checkHealth: jest.fn().mockResolvedValue(true),
      getServerStatus: jest.fn().mockReturnValue('running'),
      isServerProcessRunning: jest.fn().mockReturnValue(true),
      getServerDiagnostics: jest.fn().mockReturnValue({ authHeader: 'Bearer secret-token' }),
    };
    plugin.startupCoordinator = {
      getStartupPerfSummaryLines: jest.fn().mockReturnValue([]),
      getStartupPerformanceDiagnosisLines: jest.fn().mockReturnValue([]),
    } as unknown as typeof plugin.startupCoordinator;
    plugin.manifest = { name: 'OpenCodian', id: 'opencodian', version: '1.0.0' };

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-05-23T00:00:00.000Z');
    const report = await plugin.buildDiagnosticReport('copy-diagnostics');

    expect(report).toContain('# OpenCodian Diagnostic Report');
    expect(report).not.toContain('Bearer secret-token');
    expect(report).toContain('[REDACTED]');
    expect(report).toContain(sanitizeDiagnosticReport('Bearer secret-token'));
  });

  it('does not write openCodeSessionId when creating a conversation from a Claude session', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      conversations: Conversation[];
      storage: { saveConversation: jest.Mock<Promise<void>, [Conversation]> };
      touchConversationFullMessageCache: jest.Mock<void, [string]>;
      trimConversationFullMessageCache: jest.Mock<void, []>;
    };

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      activeBackend: 'claude-code',
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.touchConversationFullMessageCache = jest.fn();
    plugin.trimConversationFullMessageCache = jest.fn();

    const conversation = await plugin.createConversationFromSession('claude-sdk-session');

    expect(conversation.backend).toBe('claude-code');
    expect(conversation.openCodeSessionId).toBeUndefined();
    expect(conversation.backendSessionId).toBe('claude-sdk-session');
    expect(plugin.storage.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('prefers explicit backend from initial over settings.activeBackend', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      conversations: Conversation[];
      storage: { saveConversation: jest.Mock<Promise<void>, [Conversation]> };
      touchConversationFullMessageCache: jest.Mock<void, [string]>;
      trimConversationFullMessageCache: jest.Mock<void, []>;
    };

    // activeBackend is opencode, but the session actually belongs to claude-code
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      activeBackend: 'opencode',
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.touchConversationFullMessageCache = jest.fn();
    plugin.trimConversationFullMessageCache = jest.fn();

    const conversation = await plugin.createConversationFromSession('claude-forked-session', {
      backend: 'claude-code',
      title: 'Forked from Claude',
    });

    expect(conversation.backend).toBe('claude-code');
    expect(conversation.backendSessionId).toBe('claude-forked-session');
    expect(conversation.openCodeSessionId).toBeUndefined();
    expect(plugin.storage.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('uses explicit opencode backend from initial even when activeBackend is claude-code', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: typeof DEFAULT_SETTINGS;
      conversations: Conversation[];
      storage: { saveConversation: jest.Mock<Promise<void>, [Conversation]> };
      touchConversationFullMessageCache: jest.Mock<void, [string]>;
      trimConversationFullMessageCache: jest.Mock<void, []>;
    };

    plugin.settings = {
      ...DEFAULT_SETTINGS,
      activeBackend: 'claude-code',
    };
    plugin.conversations = [];
    plugin.storage = {
      saveConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.touchConversationFullMessageCache = jest.fn();
    plugin.trimConversationFullMessageCache = jest.fn();

    const conversation = await plugin.createConversationFromSession('opencode-forked-session', {
      backend: 'opencode',
    });

    expect(conversation.backend).toBe('opencode');
    expect(conversation.backendSessionId).toBe('opencode-forked-session');
    expect(conversation.openCodeSessionId).toBe('opencode-forked-session');
  });

  it('deletes conversations through their owning session backend', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      agentServiceRegistry: AgentServiceRegistry;
      openCodeService: {
        deleteSession: jest.Mock<Promise<void>, [string]>;
      };
      conversations: Conversation[];
      storage: { deleteConversation: jest.Mock<Promise<void>, [string]> };
      conversationFullMessageCache: { forget: jest.Mock<void, [string]> };
    };
    const claudeAdapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: DEFAULT_SETTINGS.backendSettings.claudeCode,
      sdk: { query: jest.fn(() => (async function* () {})()) },
    });
    const sessionId = await claudeAdapter.createSession();

    plugin.agentServiceRegistry = new AgentServiceRegistry();
    plugin.agentServiceRegistry.register(claudeAdapter);
    plugin.agentServiceRegistry.setEnabledBackends(['claude-code']);
    plugin.openCodeService = {
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };
    plugin.conversations = [createConversation('claude', {
      backend: 'claude-code',
      openCodeSessionId: undefined,
      backendSessionId: sessionId,
    })];
    plugin.storage = {
      deleteConversation: jest.fn().mockResolvedValue(undefined),
    };
    plugin.conversationFullMessageCache = {
      forget: jest.fn(),
    };
    const deleteSpy = jest.spyOn(claudeAdapter, 'deleteSession');

    await plugin.deleteConversation('claude');

    expect(deleteSpy).toHaveBeenCalledWith(sessionId);
    expect(plugin.openCodeService.deleteSession).not.toHaveBeenCalled();
    expect(plugin.storage.deleteConversation).toHaveBeenCalledWith('claude');
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
  it('delegates saveSettings to the settings runtime coordinator', async () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      settings: Record<string, unknown>;
      settingsRuntimeCoordinator: { saveSettings: jest.Mock<Promise<void>, [unknown]> };
    };

    plugin.settings = {};
    plugin.settingsRuntimeCoordinator = {
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };

    await plugin.saveSettings({
      syncService: false,
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });

    expect(plugin.settingsRuntimeCoordinator.saveSettings).toHaveBeenCalledWith({
      syncService: false,
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });
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

  it('reapplies tab layout when settings refresh open views', () => {
    const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
      app: {
        workspace: {
          getLeavesOfType: jest.Mock<Array<{ view: unknown }>, [string]>;
        };
      };
      settings: typeof DEFAULT_SETTINGS;
    };
    const openCodianView = Object.assign(Object.create(OpenCodianView.prototype), {
      applyLocaleTexts: jest.fn(),
      contentEl: document.createElement('div'),
      applyChatAppearanceSettings: jest.fn(),
      applyChatScrollMode: jest.fn(),
      applyTabBarLayout: jest.fn(),
      refreshAvailabilityUi: jest.fn(),
      reloadModelCatalog: jest.fn(),
    });

    plugin.settings = { ...DEFAULT_SETTINGS };
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
        runtimeCoordinator: { refreshOpenCodianViews: (options?: { reloadModels?: boolean; applyUi?: boolean }) => void };
      }
    ).runtimeCoordinator.refreshOpenCodianViews({ reloadModels: false, applyUi: true });

    expect(openCodianView.applyTabBarLayout).toHaveBeenCalledTimes(1);
    expect(openCodianView.refreshAvailabilityUi).toHaveBeenCalledTimes(1);
    expect(openCodianView.reloadModelCatalog).not.toHaveBeenCalled();
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
