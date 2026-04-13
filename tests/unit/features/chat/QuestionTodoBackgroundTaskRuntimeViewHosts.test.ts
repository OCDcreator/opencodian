import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { Conversation, QuestionRequest, SessionTodo } from '../../../../src/core/types';
import type {
  QuestionTodoStatusRefreshRuntime,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
  type QuestionTodoBackgroundTaskRuntimeServiceBundleHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle';
import type {
  TabConversationSyncFingerprintRuntimePort,
} from '../../../../src/features/chat/services/TabConversationSyncFingerprintPortProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type QuestionDockCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getQuestionDockCoordinator']
>;
type SessionTodoStateService = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getSessionTodoStateService']
>;
type SessionTodoStatusRefreshService = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getSessionTodoStatusRefreshService']
>;
type QuestionDockSlotCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getQuestionDockSlotCoordinator']
>;
type SessionTodoDockCoordinator = ReturnType<
  QuestionTodoBackgroundTaskRuntimeServiceBundleHost['getSessionTodoDockCoordinator']
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

function createConversationSyncRuntime(): ConversationSyncRuntime {
  return {
    setTabConversationSyncFingerprint: jest.fn(),
  } as jest.Mocked<Pick<TabConversationSyncFingerprintRuntimePort, 'setTabConversationSyncFingerprint'>>;
}

function createFixture() {
  let conversation = createConversation('conversation-active');
  let runtime = createRuntime();
  let conversationSyncRuntime = createConversationSyncRuntime();
  let questionDockCoordinator = createQuestionDockCoordinator();
  let sessionTodoStateService = createSessionTodoStateService();
  let sessionTodoStatusRefreshService = createSessionTodoStatusRefreshService();
  let questionDockSlotCoordinator = createQuestionDockSlotCoordinator();
  let sessionTodoDockCoordinator = createSessionTodoDockCoordinator();
  let backgroundTaskIndicatorCoordinator = createBackgroundTaskIndicatorCoordinator();
  let backgroundTaskLiveSignalCoordinator = createBackgroundTaskLiveSignalCoordinator();
  let tabRuntimeStateBridge = createTabRuntimeStateBridge();

  const host: Mocked<QuestionTodoBackgroundTaskRuntimeServiceBundleHost> = {
    getCurrentConversation: jest.fn(() => conversation),
    setCurrentConversationRevertState: jest.fn(),
    getConversationSyncRuntime: jest.fn(() => conversationSyncRuntime),
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
    setConversationSyncRuntime: (next: ConversationSyncRuntime) => {
      conversationSyncRuntime = next;
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

describe('QuestionTodoBackgroundTaskRuntimeViewHosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives the shared P2 view hosts directly from the service-bundle host', async () => {
    const fixture = createFixture();
    const {
      visibleConversationPostSyncStateViewHost,
      questionTodoBackgroundTaskRefreshViewHost,
      backgroundConversationPostSyncHandoffViewHost,
      questionTodoBackgroundTaskActivationViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const conversation = createConversation('conversation-next');

    expect(visibleConversationPostSyncStateViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    visibleConversationPostSyncStateViewHost.setCurrentConversationRevertState({
      messageID: 'message-1',
    });
    visibleConversationPostSyncStateViewHost.setTabConversationSyncFingerprint(
      'tab-active',
      'fingerprint-next',
    );

    expect(questionTodoBackgroundTaskRefreshViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    expect(questionTodoBackgroundTaskRefreshViewHost.getTabRuntimeState('tab-active')).toBe(
      fixture.host.getTabRuntimeState.mock.results[0].value,
    );
    expect(
      questionTodoBackgroundTaskRefreshViewHost.hasIncompleteTodos([
        { id: 'todo-1', content: 'Todo', status: 'pending' },
      ]),
    ).toBe(true);
    await questionTodoBackgroundTaskRefreshViewHost.refreshPendingQuestionsForTab(
      'tab-active',
      'session-question',
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionStatus(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionTodos(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );

    backgroundConversationPostSyncHandoffViewHost.syncBackgroundTaskStateFromConversation(
      conversation,
      'tab-active',
    );
    await backgroundConversationPostSyncHandoffViewHost.flushBackgroundTaskPostSyncWriteback(
      'tab-active',
      conversation,
    );
    backgroundConversationPostSyncHandoffViewHost.markBackgroundTaskAuthoritativeSync(
      'tab-active',
      'session.diff',
    );
    backgroundConversationPostSyncHandoffViewHost.setTabNeedsAttention('tab-active', true);

    expect(questionTodoBackgroundTaskActivationViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-active'),
    );
    questionTodoBackgroundTaskActivationViewHost.renderQuestionDock();
    questionTodoBackgroundTaskActivationViewHost.updateSessionTodoDockForTab('tab-active');
    questionTodoBackgroundTaskActivationViewHost.renderSessionTodoDock('tab-active');
    questionTodoBackgroundTaskActivationViewHost.resetBackgroundTaskIndicator();
    questionTodoBackgroundTaskActivationViewHost.syncBackgroundTaskStateFromConversation(
      conversation,
      'tab-active',
    );
    await questionTodoBackgroundTaskActivationViewHost.renderBackgroundTaskIndicatorIfNeeded(
      'tab-active',
    );

    expect(fixture.host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'message-1',
    });
    expect(fixture.host.getConversationSyncRuntime().setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-active', 'fingerprint-next');
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(
      fixture.host.getQuestionDockCoordinator.mock.results[0].value.refreshPendingQuestionsForTab,
    ).toHaveBeenCalledWith('tab-active', 'session-question');
    expect(
      fixture.host.getSessionTodoStateService.mock.results[0].value.hasIncompleteTodos,
    ).toHaveBeenCalledWith([
      { id: 'todo-1', content: 'Todo', status: 'pending' },
    ]);
    expect(
      fixture.host.getSessionTodoStatusRefreshService.mock.results[0].value.refreshTabSessionStatus,
    ).toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
    expect(
      fixture.host.getSessionTodoStatusRefreshService.mock.results[1].value.refreshTabSessionTodos,
    ).toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenNthCalledWith(1, conversation, 'tab-active');
    expect(
      fixture
        .host
        .getBackgroundTaskIndicatorCoordinator
        .mock
        .results[0]
        .value
        .flushCompletionNoticesAndSyncStreamLikeState,
    ).toHaveBeenCalledWith('tab-active', conversation);
    expect(
      fixture.host.getBackgroundTaskLiveSignalCoordinator.mock.results[0].value.markAuthoritativeSync,
    ).toHaveBeenCalledWith('tab-active', 'session.diff');
    expect(
      fixture.host.getTabRuntimeStateBridge.mock.results[0].value.setNeedsAttention,
    ).toHaveBeenCalledWith('tab-active', true);
    expect(fixture.host.getQuestionDockSlotCoordinator.mock.results[0].value.render)
      .toHaveBeenCalledTimes(1);
    expect(fixture.host.getSessionTodoDockCoordinator.mock.results[0].value.updateForTab)
      .toHaveBeenCalledWith('tab-active');
    expect(fixture.host.renderSessionTodoDock).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenNthCalledWith(2, conversation, 'tab-active');
    expect(fixture.host.renderBackgroundTaskIndicatorIfNeeded)
      .toHaveBeenCalledWith('tab-active');
  });

  it('keeps the shared view hosts late-bound to the latest runtime collaborators', async () => {
    const fixture = createFixture();
    const {
      visibleConversationPostSyncStateViewHost,
      questionTodoBackgroundTaskRefreshViewHost,
      backgroundConversationPostSyncHandoffViewHost,
      questionTodoBackgroundTaskActivationViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const nextConversation = createConversation('conversation-next');
    const nextRuntime = createRuntime({
      sessionTodos: [{ id: 'todo-2', content: 'Next', status: 'pending' }],
    });
    const nextConversationSyncRuntime = createConversationSyncRuntime();
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
    fixture.setConversationSyncRuntime(nextConversationSyncRuntime);
    fixture.setQuestionDockCoordinator(nextQuestionDockCoordinator);
    fixture.setSessionTodoStateService(nextSessionTodoStateService);
    fixture.setSessionTodoStatusRefreshService(nextSessionTodoStatusRefreshService);
    fixture.setQuestionDockSlotCoordinator(nextQuestionDockSlotCoordinator);
    fixture.setSessionTodoDockCoordinator(nextSessionTodoDockCoordinator);
    fixture.setBackgroundTaskIndicatorCoordinator(nextBackgroundTaskIndicatorCoordinator);
    fixture.setBackgroundTaskLiveSignalCoordinator(nextBackgroundTaskLiveSignalCoordinator);
    fixture.setTabRuntimeStateBridge(nextTabRuntimeStateBridge);

    expect(visibleConversationPostSyncStateViewHost.getCurrentConversation()).toEqual(
      nextConversation,
    );
    visibleConversationPostSyncStateViewHost.setTabConversationSyncFingerprint(
      'tab-next',
      'fingerprint-late',
    );
    expect(questionTodoBackgroundTaskRefreshViewHost.getTabRuntimeState('tab-next')).toBe(
      nextRuntime,
    );
    expect(questionTodoBackgroundTaskRefreshViewHost.getCurrentConversation()).toEqual(
      nextConversation,
    );
    expect(
      questionTodoBackgroundTaskRefreshViewHost.hasIncompleteTodos([
        { id: 'todo-2', content: 'Next', status: 'pending' },
      ]),
    ).toBe(true);
    await questionTodoBackgroundTaskRefreshViewHost.refreshPendingQuestionsForTab(
      'tab-next',
      'session-question-next',
    );
    await questionTodoBackgroundTaskRefreshViewHost.refreshTabSessionTodos(
      'tab-next',
      'session-next',
      { suppressErrors: true },
    );
    questionTodoBackgroundTaskActivationViewHost.renderQuestionDock();
    backgroundConversationPostSyncHandoffViewHost.markBackgroundTaskAuthoritativeSync(
      'tab-next',
      'message.updated',
    );

    expect(nextConversationSyncRuntime.setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-next', 'fingerprint-late');
    expect(nextQuestionDockCoordinator.refreshPendingQuestionsForTab)
      .toHaveBeenCalledWith('tab-next', 'session-question-next');
    expect(fixture.host.getSessionTodoStateService).toHaveBeenCalledTimes(1);
    expect(nextSessionTodoStatusRefreshService.refreshTabSessionTodos)
      .toHaveBeenCalledWith('tab-next', 'session-next', { suppressErrors: true });
    expect(nextQuestionDockSlotCoordinator.render).toHaveBeenCalledTimes(1);
    expect(nextBackgroundTaskLiveSignalCoordinator.markAuthoritativeSync)
      .toHaveBeenCalledWith('tab-next', 'message.updated');
  });
});
