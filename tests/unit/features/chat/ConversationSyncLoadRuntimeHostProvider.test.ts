import {
  createEmptyTabContextState,
  type Conversation,
} from '../../../../src/core/types';
import {
  createConversationSyncLoadRuntimeViewHostFactoryHost,
  type ConversationSyncLoadRuntimeHostProviderHost,
} from '../../../../src/features/chat/services/ConversationSyncLoadRuntimeHostProvider';
import type { TabData } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type ConversationSyncResult = Awaited<
  ReturnType<ConversationSyncLoadRuntimeHostProviderHost['syncConversationMessagesFromServer']>
>;
type TabRuntimeState = ReturnType<
  ConversationSyncLoadRuntimeHostProviderHost['getTabRuntimeState']
>;

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
  let activeTabId: string | null = 'tab-active';
  let tabs = [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: hiddenConversation.id,
      title: 'Hidden tab',
      isActive: false,
    }),
  ];
  let tabRuntimeState: TabRuntimeState = {
    isStreaming: false,
    isConversationSyncInFlight: false,
    lastConversationSyncFingerprint: 'runtime-fingerprint',
    pendingSignalConversationSyncReasons: new Set(),
    signalConversationSyncTimerId: null,
  };
  let syncResult: ConversationSyncResult = {
    changed: true,
    messages: hiddenConversation.messages,
    fingerprint: 'sync-fingerprint',
    revertState: { messageID: 'assistant-1' },
  };
  const host: Mocked<ConversationSyncLoadRuntimeHostProviderHost> = {
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversationById: jest.fn().mockResolvedValue(hiddenConversation),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn(() => activeTabId),
    getAllTabs: jest.fn(() => tabs),
    getTab: jest.fn((tabId: string | null) => tabs.find((tab) => tab.id === tabId) ?? null),
    getTabRuntimeState: jest.fn(() => tabRuntimeState),
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint:0'),
    syncConversationMessagesFromServer: jest.fn(() => Promise.resolve(syncResult)),
    setCurrentConversationRevertState: jest.fn(),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    hasInterruptedLocalAssistantTail: jest.fn().mockReturnValue(false),
  };

  return {
    currentConversation,
    hiddenConversation,
    host,
    setActiveTabId: (next: string | null) => {
      activeTabId = next;
    },
    setSyncResult: (next: ConversationSyncResult) => {
      syncResult = next;
    },
    setTabs: (next: TabData[]) => {
      tabs = next;
    },
    setTabRuntimeState: (next: TabRuntimeState) => {
      tabRuntimeState = next;
    },
  };
}

describe('ConversationSyncLoadRuntimeHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin sync/load seam into the existing factory host ports', async () => {
    const fixture = createFixture();
    const factoryHost = createConversationSyncLoadRuntimeViewHostFactoryHost(fixture.host);
    const conversationStore = factoryHost.getConversationStore();
    const tabRuntime = factoryHost.getTabRuntime();
    const conversationSyncBridge = factoryHost.getConversationSyncBridge();

    await conversationStore.loadConversations();
    await expect(conversationStore.getConversationById('conversation-hidden')).resolves.toBe(
      fixture.hiddenConversation,
    );
    expect(tabRuntime.getCurrentConversation()).toEqual(fixture.currentConversation);
    expect(tabRuntime.getActiveTabId()).toBe('tab-active');
    expect(tabRuntime.getAllTabs()).toHaveLength(2);
    expect(tabRuntime.getTab('tab-hidden')).toEqual(fixture.host.getAllTabs.mock.results[0].value[1]);
    expect(tabRuntime.getTabRuntimeState('tab-active')).toMatchObject({
      lastConversationSyncFingerprint: 'runtime-fingerprint',
    });
    expect(conversationSyncBridge.getConversationSyncFingerprint([])).toBe('fingerprint:0');
    await expect(
      conversationSyncBridge.syncConversationMessagesFromServer(
        fixture.hiddenConversation,
        'tab-hidden',
        'background-sync',
      ),
    ).resolves.toMatchObject({
      fingerprint: 'sync-fingerprint',
      revertState: { messageID: 'assistant-1' },
    });
    conversationSyncBridge.setCurrentConversationRevertState({ messageID: 'assistant-2' });
    await conversationSyncBridge.applySyncedConversationUpdate([], []);
    await conversationSyncBridge.renderBackgroundTaskIndicatorIfNeeded('tab-hidden');
    expect(factoryHost.hasInterruptedLocalAssistantTail([])).toBe(false);

    expect(fixture.host.loadConversations).toHaveBeenCalledTimes(1);
    expect(fixture.host.getConversationById).toHaveBeenCalledWith('conversation-hidden');
    expect(fixture.host.getTab).toHaveBeenCalledWith('tab-hidden');
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(fixture.host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      fixture.hiddenConversation,
      'tab-hidden',
      'background-sync',
      undefined,
    );
    expect(fixture.host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-2',
    });
    expect(fixture.host.applySyncedConversationUpdate).toHaveBeenCalledWith([], []);
    expect(fixture.host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-hidden');
    expect(fixture.host.hasInterruptedLocalAssistantTail).toHaveBeenCalledWith([]);
  });

  it('keeps the grouped ports late-bound to the latest sync/load collaborators', async () => {
    const fixture = createFixture();
    const factoryHost = createConversationSyncLoadRuntimeViewHostFactoryHost(fixture.host);
    const tabRuntime = factoryHost.getTabRuntime();
    const conversationSyncBridge = factoryHost.getConversationSyncBridge();
    const nextTabs = [
      createTab({
        id: 'tab-next',
        conversationId: fixture.hiddenConversation.id,
        title: 'Next tab',
      }),
    ];

    fixture.setActiveTabId('tab-next');
    fixture.setTabs(nextTabs);
    fixture.setTabRuntimeState({
      isStreaming: true,
      isConversationSyncInFlight: true,
      lastConversationSyncFingerprint: 'runtime-next',
      pendingSignalConversationSyncReasons: new Set(['manual']),
      signalConversationSyncTimerId: 1 as unknown as ReturnType<typeof setTimeout>,
    });
    fixture.setSyncResult({
      changed: false,
      messages: fixture.hiddenConversation.messages,
      fingerprint: 'sync-fingerprint-next',
      revertState: null,
    });
    fixture.host.getConversationSyncFingerprint.mockReturnValue('fingerprint:1');
    fixture.host.hasInterruptedLocalAssistantTail.mockReturnValue(true);

    expect(tabRuntime.getActiveTabId()).toBe('tab-next');
    expect(tabRuntime.getAllTabs()).toEqual(nextTabs);
    expect(tabRuntime.getTabRuntimeState('tab-next')).toMatchObject({
      isConversationSyncInFlight: true,
      lastConversationSyncFingerprint: 'runtime-next',
    });
    expect(conversationSyncBridge.getConversationSyncFingerprint([])).toBe('fingerprint:1');
    await expect(
      conversationSyncBridge.syncConversationMessagesFromServer(
        fixture.hiddenConversation,
        'tab-next',
        'load-conversation',
      ),
    ).resolves.toMatchObject({
      fingerprint: 'sync-fingerprint-next',
      revertState: null,
    });
    expect(factoryHost.hasInterruptedLocalAssistantTail([])).toBe(true);

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
