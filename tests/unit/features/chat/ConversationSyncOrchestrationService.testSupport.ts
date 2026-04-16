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

export type { TabConversationSyncContext };

afterEach(() => {
  jest.useRealTimers();
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export function createManualScheduler() {
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

export function createConversation(
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

export function createTab(overrides?: Partial<TabData>): TabData {
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

export function createRuntimeState(
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

export function createService(options?: {
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
