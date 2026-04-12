import {
  createEmptyTabContextState,
  type Conversation,
} from '../../../../src/core/types';
import {
  ConversationSyncOrchestrationService,
  type ConversationSyncOrchestrationHost,
  type ConversationSyncOrchestrationRuntime,
} from '../../../../src/features/chat/services/ConversationSyncOrchestrationService';
import type {
  ConversationSyncRuntime,
  TabConversationSyncContext,
} from '../../../../src/features/chat/services/ConversationSyncRuntimeCoordinator';
import type { TabData } from '../../../../src/features/chat/tabs';

describe('ConversationSyncOrchestrationService', () => {
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
      id: 'tab-1',
      conversationId: 'conversation-1',
      title: 'Tab 1',
      isActive: false,
      isStreaming: false,
      hasBackgroundTask: false,
      needsAttention: false,
      modelOverride: null,
      contextUsage: createEmptyTabContextState(),
      ...overrides,
    };
  }

  function createRuntimeState(overrides?: Partial<ConversationSyncRuntime>): ConversationSyncRuntime {
    return {
      isStreaming: false,
      isConversationSyncInFlight: false,
      lastConversationSyncFingerprint: null,
      ...overrides,
    };
  }

  function createService(options?: {
    activeTabId?: string | null;
    currentConversation?: Conversation | null;
    tabs?: TabData[];
    runtimes?: Record<string, ConversationSyncRuntime | null>;
    conversations?: Record<string, Conversation | null>;
    runTabConversationSync?: ConversationSyncOrchestrationRuntime['runTabConversationSync'];
  }) {
    const tabs = options?.tabs ?? [createTab()];
    const conversations = new Map<string, Conversation | null>(
      Object.entries(options?.conversations ?? {
        'conversation-1': createConversation('conversation-1'),
      }),
    );
    const runtimes = new Map<string, ConversationSyncRuntime | null>(
      Object.entries(options?.runtimes ?? {
        'tab-1': createRuntimeState(),
      }),
    );

    const host: ConversationSyncOrchestrationHost = {
      getCurrentConversation: jest.fn().mockReturnValue(
        options?.currentConversation ?? createConversation('conversation-active'),
      ),
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
    };

    const runtime: ConversationSyncOrchestrationRuntime = {
      runTabConversationSync: options?.runTabConversationSync
        ?? jest.fn(async (syncOptions, callback) => {
          if (!syncOptions.tabId || !syncOptions.conversation) {
            return false;
          }

          await callback({
            tabId: syncOptions.tabId,
            conversation: syncOptions.conversation,
            previousFingerprint: 'previous-fingerprint',
          });
          return true;
        }),
    };

    return {
      service: new ConversationSyncOrchestrationService(host, runtime),
      host,
      runtime,
    };
  }

  it('dispatches active signal sync through the visible conversation callback', async () => {
    const { service, runtime } = createService({
      activeTabId: 'tab-1',
      currentConversation: createConversation('conversation-1'),
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    await service.syncConversationFromSignal('tab-1', 'message.updated', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncTabConversation).not.toHaveBeenCalled();
    expect(runtime.runTabConversationSync).not.toHaveBeenCalled();
  });

  it('loads inactive tab conversations before dispatching signal sync work', async () => {
    const conversation = createConversation('conversation-2');
    const { service, host, runtime } = createService({
      activeTabId: 'tab-active',
      tabs: [
        createTab({
          id: 'tab-2',
          conversationId: 'conversation-2',
          hasBackgroundTask: true,
        }),
      ],
      conversations: {
        'conversation-2': conversation,
      },
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    await service.syncConversationFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(host.getConversationById).toHaveBeenCalledWith('conversation-2');
    expect(runtime.runTabConversationSync).toHaveBeenCalledTimes(1);
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-2',
      conversation,
      previousFingerprint: 'previous-fingerprint',
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
    });
  });

  it('polls only eligible non-active background-task tabs', async () => {
    const callbackContexts: TabConversationSyncContext[] = [];
    const { service, host } = createService({
      currentConversation: createConversation('conversation-active'),
      tabs: [
        createTab({
          id: 'tab-active',
          conversationId: 'conversation-active',
          hasBackgroundTask: true,
        }),
        createTab({
          id: 'tab-no-task',
          conversationId: 'conversation-no-task',
        }),
        createTab({
          id: 'tab-busy',
          conversationId: 'conversation-busy',
          hasBackgroundTask: true,
        }),
        createTab({
          id: 'tab-eligible',
          conversationId: 'conversation-eligible',
          hasBackgroundTask: true,
        }),
      ],
      conversations: {
        'conversation-eligible': createConversation('conversation-eligible'),
      },
      runtimes: {
        'tab-active': createRuntimeState(),
        'tab-no-task': createRuntimeState(),
        'tab-busy': createRuntimeState({ isStreaming: true }),
        'tab-eligible': createRuntimeState(),
      },
    });

    await service.syncBackgroundTaskTabs(async (context) => {
      callbackContexts.push(context);
    });

    expect(host.getConversationById).toHaveBeenCalledTimes(1);
    expect(host.getConversationById).toHaveBeenCalledWith('conversation-eligible');
    expect(callbackContexts).toEqual([
      expect.objectContaining({
        tabId: 'tab-eligible',
        previousFingerprint: 'previous-fingerprint',
      }),
    ]);
  });
});
