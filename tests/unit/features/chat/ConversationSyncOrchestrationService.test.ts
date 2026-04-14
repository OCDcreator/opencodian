import {
  type Conversation,
  createEmptyTabContextState,
} from '../../../../src/core/types';
import {
  type ConversationSyncOrchestrationHost,
  type ConversationSyncOrchestrationRuntime,
  ConversationSyncOrchestrationService,
  type ConversationSyncScheduler,
  type ConversationSyncSignalRuntime,
} from '../../../../src/features/chat/services/ConversationSyncOrchestrationService';
import type {
  TabConversationSyncContext,
} from '../../../../src/features/chat/services/ConversationSyncRuntimeCoordinator';
import type { TabData } from '../../../../src/features/chat/tabs';

describe('ConversationSyncOrchestrationService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  function createManualScheduler() {
    let nextId = 1;
    const intervals = new Map<number, () => void>();
    const timeouts = new Map<number, () => void>();

    return {
      scheduler: {
        setInterval: jest.fn((callback: () => void) => {
          const id = nextId++;
          intervals.set(id, callback);
          return id;
        }),
        clearInterval: jest.fn((timerId: number) => {
          intervals.delete(timerId);
        }),
        setTimeout: jest.fn((callback: () => void) => {
          const id = nextId++;
          timeouts.set(id, callback);
          return id;
        }),
        clearTimeout: jest.fn((timerId: number) => {
          timeouts.delete(timerId);
        }),
      } satisfies ConversationSyncScheduler,
      runNextTimeout: async () => {
        const nextTimeout = timeouts.entries().next().value ?? null;
        if (!nextTimeout) {
          return false;
        }

        const [timerId, callback] = nextTimeout;
        timeouts.delete(timerId);
        callback();
        await flushMicrotasks();
        return true;
      },
      runIntervals: () => {
        for (const callback of intervals.values()) {
          callback();
        }
      },
      getTimeoutCount: () => timeouts.size,
      getIntervalCount: () => intervals.size,
    };
  }

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

  function createRuntimeState(
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

  function createService(options?: {
    activeTabId?: string | null;
    currentConversation?: Conversation | null;
    tabs?: TabData[];
    runtimes?: Record<string, ConversationSyncSignalRuntime | null>;
    conversations?: Record<string, Conversation | null>;
    runTabConversationSync?: ConversationSyncOrchestrationRuntime['runTabConversationSync'];
    scheduler?: ConversationSyncScheduler;
  }) {
    const tabs = options?.tabs ?? [createTab()];
    const conversations = new Map<string, Conversation | null>(
      Object.entries(options?.conversations ?? {
        'conversation-1': createConversation('conversation-1'),
      }),
    );
    const runtimes = new Map<string, ConversationSyncSignalRuntime | null>(
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
      service: new ConversationSyncOrchestrationService(host, runtime, options?.scheduler),
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
      runtimes: {
        'tab-2': createRuntimeState(),
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

  it('debounces and merges signal sync reasons before dispatching hidden-tab work', async () => {
    const conversation = createConversation('conversation-2');
    const manualScheduler = createManualScheduler();
    const { service, runtime } = createService({
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
      runtimes: {
        'tab-2': createRuntimeState(),
      },
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    service.scheduleConversationSyncFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });
    service.scheduleConversationSyncFromSignal('tab-2', 'message.updated', {
      syncVisibleConversation,
      syncTabConversation,
    });

    expect(manualScheduler.getTimeoutCount()).toBe(1);
    await manualScheduler.runNextTimeout();

    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(runtime.runTabConversationSync).toHaveBeenCalledTimes(1);
    expect(syncTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-2',
      conversation,
      previousFingerprint: 'previous-fingerprint',
      reason: 'message.updated+session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
    });
  });

  it('cancels scheduled signal sync work when the tab is cleared', async () => {
    const manualScheduler = createManualScheduler();
    const { service, runtime } = createService({
      activeTabId: 'tab-active',
      tabs: [
        createTab({
          id: 'tab-2',
          conversationId: 'conversation-2',
        }),
      ],
      conversations: {
        'conversation-2': createConversation('conversation-2'),
      },
      runtimes: {
        'tab-2': createRuntimeState(),
      },
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncTabConversation = jest.fn().mockResolvedValue(undefined);

    service.scheduleConversationSyncFromSignal('tab-2', 'session.diff', {
      syncVisibleConversation,
      syncTabConversation,
    });
    service.clearScheduledSignalConversationSync('tab-2');

    expect(manualScheduler.getTimeoutCount()).toBe(0);

    expect(runtime.runTabConversationSync).not.toHaveBeenCalled();
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncTabConversation).not.toHaveBeenCalled();
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

  it('starts and stops the background sync loop around eligible work', async () => {
    const manualScheduler = createManualScheduler();
    const { service } = createService({
      currentConversation: null,
      tabs: [
        createTab({
          id: 'tab-background',
          conversationId: 'conversation-background',
          hasBackgroundTask: true,
        }),
      ],
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncBackgroundTaskTabs = jest.fn().mockResolvedValue(undefined);

    service.startConversationSyncLoop({
      syncVisibleConversation,
      syncBackgroundTaskTabs,
    });
    expect(manualScheduler.getIntervalCount()).toBe(1);
    manualScheduler.runIntervals();

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncBackgroundTaskTabs).toHaveBeenCalledTimes(1);

    service.stopConversationSyncLoop();
    expect(manualScheduler.getIntervalCount()).toBe(0);
    manualScheduler.runIntervals();

    expect(syncVisibleConversation).toHaveBeenCalledTimes(1);
    expect(syncBackgroundTaskTabs).toHaveBeenCalledTimes(1);
  });

  it('skips starting the background sync loop when no sync targets exist', async () => {
    const manualScheduler = createManualScheduler();
    const { service } = createService({
      currentConversation: null,
      tabs: [
        createTab({
          id: 'tab-idle',
          conversationId: null,
          hasBackgroundTask: false,
        }),
      ],
      scheduler: manualScheduler.scheduler,
    });
    const syncVisibleConversation = jest.fn().mockResolvedValue(undefined);
    const syncBackgroundTaskTabs = jest.fn().mockResolvedValue(undefined);

    service.startConversationSyncLoop({
      syncVisibleConversation,
      syncBackgroundTaskTabs,
    });

    expect(manualScheduler.getIntervalCount()).toBe(0);
    expect(syncVisibleConversation).not.toHaveBeenCalled();
    expect(syncBackgroundTaskTabs).not.toHaveBeenCalled();
  });
});
