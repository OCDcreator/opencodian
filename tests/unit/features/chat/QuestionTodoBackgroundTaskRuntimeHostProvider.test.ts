import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../../src/core/types';
import type {
  QuestionTodoStatusRefreshRuntime,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
  type QuestionTodoBackgroundTaskRuntimeHostProviderHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeHostProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type QuestionDockCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getQuestionDockCoordinator']
>;
type SessionTodoStateService = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getSessionTodoStateService']
>;
type SessionTodoStatusRefreshService = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getSessionTodoStatusRefreshService']
>;
type QuestionDockSlotCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getQuestionDockSlotCoordinator']
>;
type SessionTodoDockCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getSessionTodoDockCoordinator']
>;
type BackgroundTaskIndicatorCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getBackgroundTaskIndicatorCoordinator']
>;
type BackgroundTaskLiveSignalCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getBackgroundTaskLiveSignalCoordinator']
>;
type TabRuntimeStateBridge = ReturnType<
  QuestionTodoBackgroundTaskRuntimeHostProviderHost['getTabRuntimeStateBridge']
>;

function createConversation(id: string): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
  };
}

function createRuntime(
  overrides?: Partial<QuestionTodoStatusRefreshRuntime>,
): QuestionTodoStatusRefreshRuntime {
  return {
    sessionTodos: [],
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    ...overrides,
  };
}

function createQuestionDockCoordinator(): QuestionDockCoordinator {
  return {
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
  };
}

function createSessionTodoStateService(): SessionTodoStateService {
  return {
    hasIncompleteTodos: jest.fn((todos: readonly SessionTodo[]) =>
      todos.some((todo) => todo.status !== 'completed'),
    ),
  };
}

function createSessionTodoStatusRefreshService(): SessionTodoStatusRefreshService {
  return {
    refreshTabSessionStatus: jest
      .fn()
      .mockResolvedValue({ status: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
  };
}

function createQuestionDockSlotCoordinator(): QuestionDockSlotCoordinator {
  return {
    render: jest.fn(),
  };
}

function createSessionTodoDockCoordinator(): SessionTodoDockCoordinator {
  return {
    updateForTab: jest.fn(),
  };
}

function createBackgroundTaskIndicatorCoordinator():
  BackgroundTaskIndicatorCoordinator {
  return {
    flushCompletionNoticesAndSyncStreamLikeState: jest.fn().mockResolvedValue(undefined),
  };
}

function createBackgroundTaskLiveSignalCoordinator():
  BackgroundTaskLiveSignalCoordinator {
  return {
    markAuthoritativeSync: jest.fn(),
  };
}

function createTabRuntimeStateBridge(): TabRuntimeStateBridge {
  return {
    setNeedsAttention: jest.fn(),
  };
}

function createFixture() {
  let conversation = createConversation('conversation-active');
  let runtime = createRuntime();
  let questionDockCoordinator = createQuestionDockCoordinator();
  let sessionTodoStateService = createSessionTodoStateService();
  let sessionTodoStatusRefreshService = createSessionTodoStatusRefreshService();
  let questionDockSlotCoordinator = createQuestionDockSlotCoordinator();
  let sessionTodoDockCoordinator = createSessionTodoDockCoordinator();
  let backgroundTaskIndicatorCoordinator = createBackgroundTaskIndicatorCoordinator();
  let backgroundTaskLiveSignalCoordinator = createBackgroundTaskLiveSignalCoordinator();
  let tabRuntimeStateBridge = createTabRuntimeStateBridge();

  const host: Mocked<QuestionTodoBackgroundTaskRuntimeHostProviderHost> = {
    getCurrentConversation: jest.fn(() => conversation),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
    getTabRuntimeState: jest.fn((tabId: string | null) => (tabId ? runtime : null)),
    renderSessionTodoDock: jest.fn(),
    getQuestionDockCoordinator: jest.fn(() => questionDockCoordinator),
    getSessionTodoStateService: jest.fn(() => sessionTodoStateService),
    getSessionTodoStatusRefreshService: jest.fn(() => sessionTodoStatusRefreshService),
    getQuestionDockSlotCoordinator: jest.fn(() => questionDockSlotCoordinator),
    getSessionTodoDockCoordinator: jest.fn(() => sessionTodoDockCoordinator),
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    getBackgroundTaskIndicatorCoordinator: jest.fn(() => backgroundTaskIndicatorCoordinator),
    getBackgroundTaskLiveSignalCoordinator: jest.fn(() => backgroundTaskLiveSignalCoordinator),
    getTabRuntimeStateBridge: jest.fn(() => tabRuntimeStateBridge),
  };

  return {
    host,
    setConversation: (next: Conversation) => {
      conversation = next;
    },
    setRuntime: (next: QuestionTodoStatusRefreshRuntime) => {
      runtime = next;
    },
    setQuestionDockCoordinator: (next: QuestionDockCoordinator) => {
      questionDockCoordinator = next;
    },
    setSessionTodoStateService: (next: SessionTodoStateService) => {
      sessionTodoStateService = next;
    },
    setSessionTodoStatusRefreshService: (next: SessionTodoStatusRefreshService) => {
      sessionTodoStatusRefreshService = next;
    },
    setQuestionDockSlotCoordinator: (next: QuestionDockSlotCoordinator) => {
      questionDockSlotCoordinator = next;
    },
    setSessionTodoDockCoordinator: (next: SessionTodoDockCoordinator) => {
      sessionTodoDockCoordinator = next;
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

describe('QuestionTodoBackgroundTaskRuntimeHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin runtime seam into the existing factory host ports', () => {
    const fixture = createFixture();
    const factoryHost = createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost(
      fixture.host,
    );
    const conversationState = factoryHost.getConversationState();
    const refreshRuntime = factoryHost.getQuestionTodoRefreshRuntime();
    const activationWriteback = factoryHost.getQuestionTodoActivationWriteback();
    const backgroundRuntime = factoryHost.getBackgroundTaskRuntime();
    const conversation = createConversation('conversation-next');

    expect(conversationState.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    conversationState.setCurrentConversationRevertState({ messageID: 'message-1' });
    conversationState.setTabConversationSyncFingerprint('tab-active', 'fingerprint-next');

    expect(refreshRuntime.getTabRuntimeState('tab-active')).toBe(
      fixture.host.getTabRuntimeState.mock.results[0].value,
    );
    refreshRuntime.renderSessionTodoDock('tab-active');
    expect(refreshRuntime.getQuestionDockCoordinator())
      .toBe(fixture.host.getQuestionDockCoordinator.mock.results[0].value);
    expect(refreshRuntime.getSessionTodoStateService())
      .toBe(fixture.host.getSessionTodoStateService.mock.results[0].value);
    expect(refreshRuntime.getSessionTodoStatusRefreshService())
      .toBe(fixture.host.getSessionTodoStatusRefreshService.mock.results[0].value);

    expect(activationWriteback.getQuestionDockSlotCoordinator())
      .toBe(fixture.host.getQuestionDockSlotCoordinator.mock.results[0].value);
    expect(activationWriteback.getSessionTodoDockCoordinator())
      .toBe(fixture.host.getSessionTodoDockCoordinator.mock.results[0].value);

    backgroundRuntime.resetBackgroundTaskIndicator();
    backgroundRuntime.syncBackgroundTaskStateFromConversation(conversation, 'tab-active');
    void backgroundRuntime.renderBackgroundTaskIndicatorIfNeeded('tab-active');
    expect(backgroundRuntime.getBackgroundTaskIndicatorCoordinator())
      .toBe(fixture.host.getBackgroundTaskIndicatorCoordinator.mock.results[0].value);
    expect(backgroundRuntime.getBackgroundTaskLiveSignalCoordinator())
      .toBe(fixture.host.getBackgroundTaskLiveSignalCoordinator.mock.results[0].value);
    expect(backgroundRuntime.getTabRuntimeStateBridge())
      .toBe(fixture.host.getTabRuntimeStateBridge.mock.results[0].value);

    expect(fixture.host.getCurrentConversation).toHaveBeenCalledTimes(1);
    expect(fixture.host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'message-1',
    });
    expect(fixture.host.setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-active', 'fingerprint-next');
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.renderSessionTodoDock).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation, 'tab-active');
    expect(fixture.host.renderBackgroundTaskIndicatorIfNeeded)
      .toHaveBeenCalledWith('tab-active');
  });

  it('keeps the grouped ports late-bound to the latest runtime collaborators', () => {
    const fixture = createFixture();
    const factoryHost = createQuestionTodoBackgroundTaskRuntimeViewHostFactoryHost(
      fixture.host,
    );
    const conversationState = factoryHost.getConversationState();
    const refreshRuntime = factoryHost.getQuestionTodoRefreshRuntime();
    const activationWriteback = factoryHost.getQuestionTodoActivationWriteback();
    const backgroundRuntime = factoryHost.getBackgroundTaskRuntime();
    const nextConversation = createConversation('conversation-next');
    const nextRuntime = createRuntime({
      sessionTodos: [{ id: 'todo-2', content: 'Next', status: 'pending' }],
    });
    const nextQuestionDockCoordinator = createQuestionDockCoordinator();
    const nextSessionTodoStateService = createSessionTodoStateService();
    const nextSessionTodoStatusRefreshService = createSessionTodoStatusRefreshService();
    const nextQuestionDockSlotCoordinator = createQuestionDockSlotCoordinator();
    const nextSessionTodoDockCoordinator = createSessionTodoDockCoordinator();
    const nextBackgroundTaskIndicatorCoordinator =
      createBackgroundTaskIndicatorCoordinator();
    const nextBackgroundTaskLiveSignalCoordinator =
      createBackgroundTaskLiveSignalCoordinator();
    const nextTabRuntimeStateBridge = createTabRuntimeStateBridge();

    fixture.setConversation(nextConversation);
    fixture.setRuntime(nextRuntime);
    fixture.setQuestionDockCoordinator(nextQuestionDockCoordinator);
    fixture.setSessionTodoStateService(nextSessionTodoStateService);
    fixture.setSessionTodoStatusRefreshService(nextSessionTodoStatusRefreshService);
    fixture.setQuestionDockSlotCoordinator(nextQuestionDockSlotCoordinator);
    fixture.setSessionTodoDockCoordinator(nextSessionTodoDockCoordinator);
    fixture.setBackgroundTaskIndicatorCoordinator(nextBackgroundTaskIndicatorCoordinator);
    fixture.setBackgroundTaskLiveSignalCoordinator(nextBackgroundTaskLiveSignalCoordinator);
    fixture.setTabRuntimeStateBridge(nextTabRuntimeStateBridge);

    expect(conversationState.getCurrentConversation()).toEqual(nextConversation);
    expect(refreshRuntime.getTabRuntimeState('tab-next')).toBe(nextRuntime);
    expect(refreshRuntime.getQuestionDockCoordinator()).toBe(nextQuestionDockCoordinator);
    expect(refreshRuntime.getSessionTodoStateService()).toBe(nextSessionTodoStateService);
    expect(refreshRuntime.getSessionTodoStatusRefreshService())
      .toBe(nextSessionTodoStatusRefreshService);
    expect(activationWriteback.getQuestionDockSlotCoordinator())
      .toBe(nextQuestionDockSlotCoordinator);
    expect(activationWriteback.getSessionTodoDockCoordinator())
      .toBe(nextSessionTodoDockCoordinator);
    expect(backgroundRuntime.getBackgroundTaskIndicatorCoordinator())
      .toBe(nextBackgroundTaskIndicatorCoordinator);
    expect(backgroundRuntime.getBackgroundTaskLiveSignalCoordinator())
      .toBe(nextBackgroundTaskLiveSignalCoordinator);
    expect(backgroundRuntime.getTabRuntimeStateBridge()).toBe(nextTabRuntimeStateBridge);
  });
});
