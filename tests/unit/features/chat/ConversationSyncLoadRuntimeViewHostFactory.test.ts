import {
  type Conversation,
  createEmptyTabContextState,
} from '../../../../src/core/types';
import {
  type ConversationSyncLoadRuntimeViewHost,
  createConversationSyncLoadRuntimeViewHosts,
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
    getTab: jest.fn().mockImplementation((tabId: string | null) =>
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
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue({
      changed: true,
      messages: hiddenConversation.messages,
      fingerprint: 'canonical-fingerprint',
      revertState: { messageID: 'assistant-1' },
    }),
    setCurrentConversationRevertState: jest.fn(),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
  let conversationStore = initialStore;
  let tabRuntime = initialTabRuntime;
  let conversationSyncBridge = initialBridge;

  const host: Mocked<ConversationSyncLoadRuntimeViewHost> = {
    loadConversations: jest.fn(() => conversationStore.loadConversations()),
    getConversationById: jest.fn((id: string) => conversationStore.getConversationById(id)),
    getCurrentConversation: jest.fn(() => tabRuntime.getCurrentConversation()),
    getActiveTabId: jest.fn(() => tabRuntime.getActiveTabId()),
    getAllTabs: jest.fn(() => tabRuntime.getAllTabs()),
    getTab: jest.fn((tabId: string | null) => tabRuntime.getTab(tabId)),
    getTabRuntimeState: jest.fn((tabId: string | null) => tabRuntime.getTabRuntimeState(tabId)),
    getConversationSyncFingerprint: jest.fn((messages) =>
      conversationSyncBridge.getConversationSyncFingerprint(messages)),
    syncConversationMessagesFromServer: jest.fn((conversation, tabId, reason, options) =>
      conversationSyncBridge.syncConversationMessagesFromServer(
        conversation,
        tabId,
        reason,
        options,
      )),
    syncConversationMessagesFromCanonicalState: jest.fn((conversation, tabId, reason, options) =>
      conversationSyncBridge.syncConversationMessagesFromCanonicalState(
        conversation,
        tabId,
        reason,
        options,
      )),
    setCurrentConversationRevertState: jest.fn((revertState) =>
      conversationSyncBridge.setCurrentConversationRevertState(revertState)),
    applySyncedConversationUpdate: jest.fn((previousMessages, nextMessages) =>
      conversationSyncBridge.applySyncedConversationUpdate(previousMessages, nextMessages)),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn((tabId) =>
      conversationSyncBridge.renderBackgroundTaskIndicatorIfNeeded(tabId)),
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

  it('derives sync/load hosts from the flattened late-bound seam', async () => {
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
      syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue({
        changed: true,
        messages: fixture.hiddenConversation.messages,
        fingerprint: 'canonical-fingerprint-2',
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
    await expect(
      conversationSyncViewHost.syncConversationMessagesFromCanonicalState(
        fixture.hiddenConversation,
        'tab-hidden',
        'sync-event:message.updated',
      ),
    ).resolves.toMatchObject({
      fingerprint: 'canonical-fingerprint-2',
      revertState: { messageID: 'assistant-2' },
    });
    expect(nextBridge.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      fixture.hiddenConversation,
      'tab-hidden',
      'sync-event:message.updated',
      undefined,
    );
    expect(nextBridge.applySyncedConversationUpdate).toHaveBeenCalledWith([], []);
    expect(nextBridge.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-hidden');
    expect(nextStore.loadConversations).toHaveBeenCalledTimes(1);
    expect(nextBridge.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-3',
    });
  });
});

describe('ConversationSyncLoadRuntimeViewHostFactory load policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('does not route Claude Code conversations through OpenCode authoritative load sync', () => {
    const fixture = createFixture();
    const {
      conversationLoadRuntimeBridgeHost,
    } = createConversationSyncLoadRuntimeViewHosts(fixture.host);
    const claudeConversation = createConversation('conversation-claude', {
      backend: 'claude-code',
      openCodeSessionId: undefined,
      backendSessionId: 'claude-code-session',
      messages: [],
    });

    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        claudeConversation,
        { forceServerSync: true },
      ),
    ).toBe(false);
  });
});

describe('ConversationSyncLoadRuntimeViewHostFactory late binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the flattened sync/load seam late-bound to the latest collaborators', async () => {
    const fixture = createFixture();
    const {
      conversationSyncViewHost,
    } = createConversationSyncLoadRuntimeViewHosts(fixture.host);
    const nextTabs = [
      createTab({
        id: 'tab-next',
        conversationId: fixture.hiddenConversation.id,
        title: 'Next tab',
      }),
    ];

    fixture.setTabRuntime({
      ...fixture.initialTabRuntime,
      getActiveTabId: jest.fn().mockReturnValue('tab-next'),
      getAllTabs: jest.fn().mockReturnValue(nextTabs),
      getTabRuntimeState: jest.fn().mockReturnValue({
        isStreaming: true,
        isConversationSyncInFlight: true,
        lastConversationSyncFingerprint: 'runtime-next',
        pendingSignalConversationSyncReasons: new Set(['manual']),
        signalConversationSyncTimerId: 1,
      }),
    });
    fixture.setConversationSyncBridge({
      ...fixture.initialBridge,
      getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint:1'),
      syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
        changed: false,
        messages: fixture.hiddenConversation.messages,
        fingerprint: 'sync-fingerprint-next',
        revertState: null,
      }),
    });
    fixture.host.hasInterruptedLocalAssistantTail.mockReturnValue(true);

    expect(conversationSyncViewHost.getActiveTabId()).toBe('tab-next');
    expect(conversationSyncViewHost.getAllTabs()).toEqual(nextTabs);
    expect(conversationSyncViewHost.getTabRuntimeState('tab-next')).toMatchObject({
      isConversationSyncInFlight: true,
      lastConversationSyncFingerprint: 'runtime-next',
    });
    expect(conversationSyncViewHost.getConversationSyncFingerprint([])).toBe('fingerprint:1');
    await expect(
      conversationSyncViewHost.syncConversationMessagesFromServer(
        fixture.hiddenConversation,
        'tab-next',
        'load-conversation',
      ),
    ).resolves.toMatchObject({
      fingerprint: 'sync-fingerprint-next',
      revertState: null,
    });

    expect(fixture.host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.host.getAllTabs).toHaveBeenCalledTimes(1);
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      fixture.hiddenConversation,
      'tab-next',
      'load-conversation',
      undefined,
    );
  });
});
