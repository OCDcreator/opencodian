import {
  createEmptyTabContextState,
  type Conversation,
} from '../../../../src/core/types';
import {
  createConversationSyncLoadRuntimeViewHosts,
  type ConversationSyncLoadRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory';
import type { TabData } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(id: string, overrides?: Partial<Conversation>): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    openCodeSessionId: `session-${id}`,
    ...overrides,
  };
}

function createTab(overrides?: Partial<TabData>): TabData {
  return {
    id: 'tab-active',
    conversationId: 'conversation-active',
    title: 'Active tab',
    isActive: true,
    isStreaming: false,
    hasBackgroundTask: false,
    needsAttention: false,
    modelOverride: null,
    contextUsage: createEmptyTabContextState(),
    ...overrides,
  };
}

function createFixture() {
  const currentConversation = createConversation('conversation-active');
  const hiddenConversation = createConversation('conversation-hidden');
  const tabs = [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: hiddenConversation.id,
      title: 'Hidden tab',
      isActive: false,
    }),
  ];
  const initialStore = {
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversationById: jest.fn().mockResolvedValue(hiddenConversation),
  };
  const initialTabRuntime = {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getTab: jest.fn().mockImplementation((tabId: string) =>
      tabs.find((tab) => tab.id === tabId) ?? null,
    ),
    getTabRuntimeState: jest.fn().mockReturnValue({
      isStreaming: false,
      isConversationSyncInFlight: false,
      lastConversationSyncFingerprint: 'runtime-fingerprint',
      pendingSignalConversationSyncReasons: new Set(),
      signalConversationSyncTimerId: null,
    }),
  };
  const initialBridge = {
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint:0'),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      changed: true,
      messages: hiddenConversation.messages,
      fingerprint: 'sync-fingerprint',
      revertState: { messageID: 'assistant-1' },
    }),
    setCurrentConversationRevertState: jest.fn(),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
  let conversationStore = initialStore;
  let tabRuntime = initialTabRuntime;
  let conversationSyncBridge = initialBridge;

  const host: Mocked<ConversationSyncLoadRuntimeViewHostFactoryHost> = {
    getConversationStore: jest.fn(() => conversationStore),
    getTabRuntime: jest.fn(() => tabRuntime),
    getConversationSyncBridge: jest.fn(() => conversationSyncBridge),
    hasInterruptedLocalAssistantTail: jest.fn().mockReturnValue(false),
  };

  return {
    currentConversation,
    hiddenConversation,
    host,
    initialBridge,
    initialStore,
    initialTabRuntime,
    setConversationStore: (next: typeof initialStore) => {
      conversationStore = next;
    },
    setConversationSyncBridge: (next: typeof initialBridge) => {
      conversationSyncBridge = next;
    },
    setTabRuntime: (next: typeof initialTabRuntime) => {
      tabRuntime = next;
    },
    tabs,
  };
}

describe('ConversationSyncLoadRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives sync/load hosts from late-bound view ports', async () => {
    const fixture = createFixture();
    const {
      conversationSyncViewHost,
      conversationLoadRuntimeBridgeHost,
    } = createConversationSyncLoadRuntimeViewHosts(fixture.host);

    expect(conversationSyncViewHost.getCurrentConversation()).toEqual(fixture.currentConversation);
    expect(conversationSyncViewHost.getActiveTabId()).toBe('tab-active');
    expect(conversationSyncViewHost.getAllTabs()).toEqual(fixture.tabs);
    expect(conversationSyncViewHost.getTab('tab-hidden')).toEqual(fixture.tabs[1]);

    const nextStore = {
      loadConversations: jest.fn().mockResolvedValue(undefined),
      getConversationById: jest.fn().mockResolvedValue(fixture.hiddenConversation),
    };
    const nextTabRuntime = {
      ...fixture.initialTabRuntime,
      getCurrentConversation: jest.fn().mockReturnValue(fixture.hiddenConversation),
    };
    const nextBridge = {
      getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint:1'),
      syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
        changed: true,
        messages: fixture.hiddenConversation.messages,
        fingerprint: 'sync-fingerprint-2',
        revertState: { messageID: 'assistant-2' },
      }),
      setCurrentConversationRevertState: jest.fn(),
      applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
      renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    };

    fixture.setConversationStore(nextStore);
    fixture.setTabRuntime(nextTabRuntime);
    fixture.setConversationSyncBridge(nextBridge);

    expect(await conversationSyncViewHost.getConversationById('conversation-hidden')).toBe(
      fixture.hiddenConversation,
    );
    expect(conversationSyncViewHost.getConversationSyncFingerprint([])).toBe('fingerprint:1');
    await expect(
      conversationSyncViewHost.syncConversationMessagesFromServer(
        fixture.hiddenConversation,
        'tab-hidden',
        'background-sync',
      ),
    ).resolves.toMatchObject({
      fingerprint: 'sync-fingerprint-2',
      revertState: { messageID: 'assistant-2' },
    });
    await conversationSyncViewHost.applySyncedConversationUpdate([], []);
    await conversationSyncViewHost.renderBackgroundTaskIndicatorIfNeeded('tab-hidden');
    await conversationLoadRuntimeBridgeHost.loadConversations();
    conversationLoadRuntimeBridgeHost.setCurrentConversationRevertState({
      messageID: 'assistant-3',
    });

    expect(nextStore.getConversationById).toHaveBeenCalledWith('conversation-hidden');
    expect(nextBridge.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(nextBridge.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      fixture.hiddenConversation,
      'tab-hidden',
      'background-sync',
      undefined,
    );
    expect(nextBridge.applySyncedConversationUpdate).toHaveBeenCalledWith([], []);
    expect(nextBridge.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-hidden');
    expect(nextStore.loadConversations).toHaveBeenCalledTimes(1);
    expect(nextBridge.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-3',
    });
  });

  it('keeps the load-sync decision inside the factory seam', () => {
    const fixture = createFixture();
    const {
      conversationLoadRuntimeBridgeHost,
    } = createConversationSyncLoadRuntimeViewHosts(fixture.host);
    const unsourcedConversation = createConversation('conversation-unsourced', {
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Hello',
          timestamp: 1,
        },
      ],
    });
    const noticeConversation = createConversation('conversation-notice', {
      messages: [
        {
          id: 'notice-1',
          role: 'assistant',
          content: 'Done',
          timestamp: 1,
          displayStyle: 'notice',
        },
      ],
    });

    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        createConversation('conversation-empty'),
        {},
      ),
    ).toBe(true);
    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        unsourcedConversation,
        {},
      ),
    ).toBe(true);

    fixture.host.hasInterruptedLocalAssistantTail.mockReturnValue(true);

    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        unsourcedConversation,
        {},
      ),
    ).toBe(false);
    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        noticeConversation,
        {},
      ),
    ).toBe(false);
    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        noticeConversation,
        { forceServerSync: true },
      ),
    ).toBe(true);
  });
});
