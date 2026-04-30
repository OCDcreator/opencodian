import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { Conversation, QuestionRequest, SessionTodo } from '../../../../src/core/types';
import type {
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
  TabConversationSyncFingerprintRuntimePort,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import type {
  QuestionTodoStatusRefreshRuntime,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type QuestionDockCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getQuestionDockCoordinator']
>;
type SessionTodoCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getSessionTodoCoordinator']
>;
type QuestionDockSlotCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getQuestionDockSlotCoordinator']
>;
type BackgroundTaskIndicatorCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getBackgroundTaskIndicatorCoordinator']
>;
type BackgroundTaskLiveSignalCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getBackgroundTaskLiveSignalCoordinator']
>;
type TabRuntimeStateBridge = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getTabRuntimeStateBridge']
>;
type ConversationSyncRuntime = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getConversationSyncRuntime']
>;

export function createConversation(id: string): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
  };
}

export function createRuntime(
  overrides?: Partial<QuestionTodoStatusRefreshRuntime>,
): QuestionTodoStatusRefreshRuntime {
  return {
    sessionTodos: [],
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    ...overrides,
  };
}

export function createQuestionDockCoordinator(): QuestionDockCoordinator {
  return {
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
  };
}

export function createSessionTodoCoordinator(): SessionTodoCoordinator {
  return {
    applyStreamingTodoSnapshotFromTool: jest.fn(),
    hasIncompleteTodos: jest.fn((todos: readonly SessionTodo[]) =>
      todos.some((todo) => todo.status !== 'completed'),
    ),
    refreshTabSessionStatus: jest
      .fn()
      .mockResolvedValue({ status: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    updateForTab: jest.fn(),
  };
}

export function createQuestionDockSlotCoordinator(): QuestionDockSlotCoordinator {
  return {
    render: jest.fn(),
  };
}

export function createBackgroundTaskIndicatorCoordinator():
  BackgroundTaskIndicatorCoordinator {
  return {
    flushCompletionNoticesAndSyncStreamLikeState: jest.fn().mockResolvedValue(undefined),
  };
}

export function createBackgroundTaskLiveSignalCoordinator():
  BackgroundTaskLiveSignalCoordinator {
  return {
    markAuthoritativeSync: jest.fn(),
  };
}

export function createTabRuntimeStateBridge(): TabRuntimeStateBridge {
  return {
    setNeedsAttention: jest.fn(),
  };
}

export function createConversationSyncRuntime(): ConversationSyncRuntime {
  return {
    setTabConversationSyncFingerprint: jest.fn(),
  } as jest.Mocked<
    Pick<TabConversationSyncFingerprintRuntimePort, 'setTabConversationSyncFingerprint'>
  >;
}

export function createFixture() {
  let activeTabId: string | null = 'tab-active';
  let conversation = createConversation('conversation-active');
  let runtime = createRuntime();
  const sessionIdsByTab = new Map<string, string | null>([
    ['tab-active', 'session-active'],
  ]);
  let conversationSyncRuntime = createConversationSyncRuntime();
  let questionDockCoordinator = createQuestionDockCoordinator();
  let sessionTodoCoordinator = createSessionTodoCoordinator();
  let questionDockSlotCoordinator = createQuestionDockSlotCoordinator();
  let backgroundTaskIndicatorCoordinator = createBackgroundTaskIndicatorCoordinator();
  let backgroundTaskLiveSignalCoordinator = createBackgroundTaskLiveSignalCoordinator();
  let tabRuntimeStateBridge = createTabRuntimeStateBridge();

  const host: Mocked<QuestionTodoBackgroundTaskRuntimeServiceBundleHost> = {
    getActiveTabId: jest.fn(() => activeTabId),
    getCurrentConversation: jest.fn(() => conversation),
    setCurrentConversationRevertState: jest.fn(),
    getConversationSyncRuntime: jest.fn(() => conversationSyncRuntime),
    getTabRuntimeState: jest.fn((tabId: string | null) => (tabId ? runtime : null)),
    getSessionIdForTab: jest.fn((tabId: string | null) =>
      tabId ? sessionIdsByTab.get(tabId) ?? null : null,
    ),
    renderSessionTodoDock: jest.fn(),
    getQuestionDockCoordinator: jest.fn(() => questionDockCoordinator),
    getSessionTodoCoordinator: jest.fn(() => sessionTodoCoordinator),
    getQuestionDockSlotCoordinator: jest.fn(() => questionDockSlotCoordinator),
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    getBackgroundTaskIndicatorCoordinator: jest.fn(() => backgroundTaskIndicatorCoordinator),
    getBackgroundTaskLiveSignalCoordinator: jest.fn(() => backgroundTaskLiveSignalCoordinator),
    getTabRuntimeStateBridge: jest.fn(() => tabRuntimeStateBridge),
  };

  return {
    host,
    getConversation: () => conversation,
    getRuntime: () => runtime,
    getConversationSyncRuntime: () => conversationSyncRuntime,
    getQuestionDockCoordinator: () => questionDockCoordinator,
    getSessionTodoCoordinator: () => sessionTodoCoordinator,
    getQuestionDockSlotCoordinator: () => questionDockSlotCoordinator,
    getBackgroundTaskIndicatorCoordinator: () => backgroundTaskIndicatorCoordinator,
    getBackgroundTaskLiveSignalCoordinator: () => backgroundTaskLiveSignalCoordinator,
    getTabRuntimeStateBridge: () => tabRuntimeStateBridge,
    setActiveTabId: (next: string | null) => {
      activeTabId = next;
    },
    setConversation: (next: Conversation) => {
      conversation = next;
    },
    setRuntime: (next: QuestionTodoStatusRefreshRuntime) => {
      runtime = next;
    },
    setSessionIdForTab: (tabId: string, sessionId: string | null) => {
      sessionIdsByTab.set(tabId, sessionId);
    },
    setConversationSyncRuntime: (next: ConversationSyncRuntime) => {
      conversationSyncRuntime = next;
    },
    setQuestionDockCoordinator: (next: QuestionDockCoordinator) => {
      questionDockCoordinator = next;
    },
    setSessionTodoCoordinator: (next: SessionTodoCoordinator) => {
      sessionTodoCoordinator = next;
    },
    setQuestionDockSlotCoordinator: (next: QuestionDockSlotCoordinator) => {
      questionDockSlotCoordinator = next;
    },
    setBackgroundTaskIndicatorCoordinator: (next: BackgroundTaskIndicatorCoordinator) => {
      backgroundTaskIndicatorCoordinator = next;
    },
    setBackgroundTaskLiveSignalCoordinator: (
      next: BackgroundTaskLiveSignalCoordinator,
    ) => {
      backgroundTaskLiveSignalCoordinator = next;
    },
    setTabRuntimeStateBridge: (next: TabRuntimeStateBridge) => {
      tabRuntimeStateBridge = next;
    },
  };
}
