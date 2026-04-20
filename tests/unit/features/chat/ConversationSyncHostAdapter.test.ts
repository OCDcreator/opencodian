import {
  type ChatMessage,
  type Conversation,
  createEmptyTabContextState,
} from '../../../../src/core/types';
import type { ConversationSyncBridgeSyncResult } from '../../../../src/features/chat/services/ConversationSyncBridge';
import {
  type ConversationSyncViewHost,
  createConversationSyncHosts,
} from '../../../../src/features/chat/services/ConversationSyncHostAdapter';
import type { ConversationSyncSignalRuntime } from '../../../../src/features/chat/services/ConversationSyncOrchestrationService';
import type { TabData } from '../../../../src/features/chat/tabs';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id: string,
  overrides?: Partial<Conversation>,
): Conversation {
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

function createRuntime(
  overrides?: Partial<ConversationSyncSignalRuntime>,
): ConversationSyncSignalRuntime {
  return {
    isStreaming: false,
    isConversationSyncInFlight: false,
    lastConversationSyncFingerprint: null,
    pendingSignalConversationSyncReasons: new Set(),
    signalConversationSyncTimerId: null,
    ...overrides,
  };
}

function createViewHost(options?: {
  activeTabId?: string | null;
  currentConversation?: Conversation | null;
  tabs?: TabData[];
  runtimes?: Record<string, ConversationSyncSignalRuntime | null>;
  conversations?: Record<string, Conversation | null>;
  syncResult?: ConversationSyncBridgeSyncResult;
}): Mocked<ConversationSyncViewHost> {
  const currentConversation = options?.currentConversation ?? createConversation('conversation-active');
  const tabs = options?.tabs ?? [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: 'conversation-hidden',
      title: 'Hidden tab',
      isActive: false,
      hasBackgroundTask: true,
    }),
  ];
  const conversations = new Map<string, Conversation | null>(
    Object.entries(options?.conversations ?? {
      'conversation-active': currentConversation,
      'conversation-hidden': createConversation('conversation-hidden'),
    }),
  );
  const runtimes = new Map<string, ConversationSyncSignalRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-active': createRuntime({ lastConversationSyncFingerprint: 'active-fingerprint' }),
      'tab-hidden': createRuntime({ lastConversationSyncFingerprint: 'hidden-fingerprint' }),
    }),
  );

  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getTab: jest.fn().mockImplementation((tabId: string) =>
      tabs.find((tab) => tab.id === tabId) ?? null,
    ),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
    getConversationById: jest.fn().mockImplementation(async (id: string) =>
      conversations.get(id) ?? null,
    ),
    getConversationSyncFingerprint: jest.fn().mockImplementation((messages: ChatMessage[]) =>
      `fingerprint:${messages.length}`,
    ),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue(
      options?.syncResult ?? {
        changed: true,
        messages: currentConversation?.messages ?? [],
        fingerprint: 'synced-fingerprint',
        revertState: null,
      },
    ),
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(
      options?.syncResult ?? {
        changed: true,
        messages: currentConversation?.messages ?? [],
        fingerprint: 'canonical-fingerprint',
        revertState: null,
      },
    ),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationSyncHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds runtime, orchestration, and bridge hosts from one view adapter', async () => {
    const hiddenConversation = createConversation('conversation-hidden');
    const hiddenRuntime = createRuntime({ lastConversationSyncFingerprint: 'hidden-runtime' });
    const viewHost = createViewHost({
      currentConversation: createConversation('conversation-active'),
      conversations: {
        'conversation-active': createConversation('conversation-active'),
        'conversation-hidden': hiddenConversation,
      },
      runtimes: {
        'tab-active': createRuntime({ lastConversationSyncFingerprint: 'active-runtime' }),
        'tab-hidden': hiddenRuntime,
      },
    });

    const hosts = createConversationSyncHosts(viewHost);

    expect(hosts.runtimeCoordinatorHost.getActiveTabId()).toBe('tab-active');
    expect(
      hosts.runtimeCoordinatorHost.getConversationSyncFingerprint([
        {
          id: 'message-1',
          role: 'assistant',
          content: 'hello',
          timestamp: 1,
        } as ChatMessage,
      ]),
    ).toBe('fingerprint:1');
    expect(hosts.orchestrationHost.getCurrentConversation()).toEqual(
      viewHost.getCurrentConversation(),
    );
    expect(hosts.orchestrationHost.getAllTabs()).toEqual(viewHost.getAllTabs());
    expect(hosts.orchestrationHost.getTab('tab-hidden')).toEqual(viewHost.getTab('tab-hidden'));
    expect(await hosts.orchestrationHost.getConversationById('conversation-hidden')).toBe(hiddenConversation);
    expect(hosts.runtimeCoordinatorHost.getTabRuntimeState('tab-hidden')).toBe(hiddenRuntime);
    expect(hosts.backgroundPostSyncRouterHost.getTabRuntimeState('tab-hidden')).toBe(hiddenRuntime);
  });

  it('routes bridge and post-sync host work back through the view adapter callbacks', async () => {
    const currentConversation = createConversation('conversation-active');
    const syncResult: ConversationSyncBridgeSyncResult = {
      changed: true,
      messages: currentConversation.messages,
      fingerprint: 'bridge-fingerprint',
      revertState: { messageID: 'assistant-1' },
    };
    const viewHost = createViewHost({
      currentConversation,
      syncResult,
    });
    const hosts = createConversationSyncHosts(viewHost);

    await expect(
      hosts.bridgeHost.syncConversationMessagesFromServer(
        currentConversation,
        'tab-active',
        'visible-background-sync',
        { suppressVerboseLogs: true },
      ),
    ).resolves.toEqual(syncResult);
    await expect(
      hosts.bridgeHost.syncConversationMessagesFromCanonicalState(
        currentConversation,
        'tab-active',
        'sync-event:message.updated',
        { suppressVerboseLogs: true },
      ),
    ).resolves.toEqual(syncResult);

    await hosts.visiblePostSyncRouterHost.applySyncedConversationUpdate(
      currentConversation.messages,
      currentConversation.messages,
    );
    await hosts.visiblePostSyncRouterHost.renderBackgroundTaskIndicatorIfNeeded('tab-active');

    expect(viewHost.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      currentConversation,
      'tab-active',
      'visible-background-sync',
      { suppressVerboseLogs: true },
    );
    expect(viewHost.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      currentConversation,
      'tab-active',
      'sync-event:message.updated',
      { suppressVerboseLogs: true },
    );
    expect(viewHost.applySyncedConversationUpdate).toHaveBeenCalledWith(
      currentConversation.messages,
      currentConversation.messages,
    );
    expect(viewHost.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-active');
  });
});
