import {
  type Conversation,
  createEmptyTabContextState,
} from '../../../../src/core/types';
import {
  type ConversationSyncLoadRuntimeHostAdapterHost,
  createConversationSyncLoadRuntimeHosts,
} from '../../../../src/features/chat/runtime/ConversationSyncLoadRuntimeHostAdapter';
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

function createHost(): Mocked<ConversationSyncLoadRuntimeHostAdapterHost> {
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
  const conversations = new Map<string, Conversation | null>([
    [currentConversation.id, currentConversation],
    [hiddenConversation.id, hiddenConversation],
  ]);
  const syncResult = {
    changed: true,
    messages: hiddenConversation.messages,
    fingerprint: 'sync-fingerprint',
    revertState: { messageID: 'assistant-1' },
  };

  return {
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
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversationById: jest.fn().mockImplementation(async (id: string) =>
      conversations.get(id) ?? null,
    ),
    shouldSyncConversationFromServer: jest.fn().mockReturnValue(true),
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint:0'),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue(syncResult),
    setCurrentConversationRevertState: jest.fn(),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationSyncLoadRuntimeHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives conversation sync and load hosts from one shared seam', async () => {
    const host = createHost();
    const {
      conversationSyncViewHost,
      conversationLoadRuntimeBridgeHost,
    } = createConversationSyncLoadRuntimeHosts(host);
    const hiddenConversation = await conversationSyncViewHost.getConversationById('conversation-hidden');

    expect(conversationSyncViewHost.getCurrentConversation()).toEqual(host.getCurrentConversation());
    expect(conversationSyncViewHost.getActiveTabId()).toBe('tab-active');
    expect(conversationSyncViewHost.getAllTabs()).toEqual(host.getAllTabs());
    expect(conversationSyncViewHost.getTab('tab-hidden')).toEqual(host.getTab('tab-hidden'));
    expect(conversationSyncViewHost.getTabRuntimeState('tab-active')).toEqual(
      host.getTabRuntimeState('tab-active'),
    );
    expect(hiddenConversation?.id).toBe('conversation-hidden');
    expect(conversationSyncViewHost.getConversationSyncFingerprint([])).toBe('fingerprint:0');

    await expect(
      conversationSyncViewHost.syncConversationMessagesFromServer(
        hiddenConversation as Conversation,
        'tab-hidden',
        'background-sync',
        { suppressVerboseLogs: true },
      ),
    ).resolves.toMatchObject({
      changed: true,
      fingerprint: 'sync-fingerprint',
      revertState: { messageID: 'assistant-1' },
    });
    await conversationSyncViewHost.applySyncedConversationUpdate([], []);
    await conversationSyncViewHost.renderBackgroundTaskIndicatorIfNeeded('tab-hidden');

    await conversationLoadRuntimeBridgeHost.loadConversations();
    expect(await conversationLoadRuntimeBridgeHost.getConversationById('conversation-hidden')).toBe(hiddenConversation);
    expect(
      conversationLoadRuntimeBridgeHost.shouldSyncConversationFromServer(
        hiddenConversation as Conversation,
        { forceServerSync: true },
      ),
    ).toBe(true);
    await expect(
      conversationLoadRuntimeBridgeHost.syncConversationMessagesFromServer(
        hiddenConversation as Conversation,
        'tab-hidden',
        'load-conversation',
      ),
    ).resolves.toEqual({
      messages: hiddenConversation?.messages ?? [],
      revertState: { messageID: 'assistant-1' },
    });
    conversationLoadRuntimeBridgeHost.setCurrentConversationRevertState({ messageID: 'assistant-2' });

    expect(host.getCurrentConversation).toHaveBeenCalledTimes(2);
    expect(host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(host.getAllTabs).toHaveBeenCalledTimes(2);
    expect(host.getTab).toHaveBeenCalledWith('tab-hidden');
    expect(host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(host.getConversationById).toHaveBeenNthCalledWith(1, 'conversation-hidden');
    expect(host.getConversationById).toHaveBeenNthCalledWith(2, 'conversation-hidden');
    expect(host.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(host.syncConversationMessagesFromServer).toHaveBeenNthCalledWith(
      1,
      hiddenConversation,
      'tab-hidden',
      'background-sync',
      { suppressVerboseLogs: true },
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenNthCalledWith(
      2,
      hiddenConversation,
      'tab-hidden',
      'load-conversation',
    );
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith([], []);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-hidden');
    expect(host.loadConversations).toHaveBeenCalledTimes(1);
    expect(host.shouldSyncConversationFromServer).toHaveBeenCalledWith(hiddenConversation, {
      forceServerSync: true,
    });
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({ messageID: 'assistant-2' });
  });
});
