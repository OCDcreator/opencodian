import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { Conversation, QuestionRequest, SessionTodo } from '../../../../src/core/types';
import type { QuestionTodoStatusRefreshRuntime } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
import {
  createQuestionTodoBackgroundTaskRuntimeViewHosts,
  type QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRuntimeViewHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type ConversationStatePort =
  ReturnType<QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getConversationState']>;
type QuestionTodoRefreshRuntimePort =
  ReturnType<QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getQuestionTodoRefreshRuntime']>;
type QuestionTodoActivationWritebackPort =
  ReturnType<QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getQuestionTodoActivationWriteback']>;
type BackgroundTaskRuntimePort =
  ReturnType<QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost['getBackgroundTaskRuntime']>;

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

function createConversationStatePort(
  conversationId = 'conversation-active',
): Mocked<ConversationStatePort> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(createConversation(conversationId)),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
  };
}

function createQuestionTodoRefreshRuntimePort(
  runtime: QuestionTodoStatusRefreshRuntime = createRuntime(),
): Mocked<QuestionTodoRefreshRuntimePort> {
  const questionDockCoordinator: ReturnType<
    QuestionTodoRefreshRuntimePort['getQuestionDockCoordinator']
  > = {
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
  };
  const sessionTodoStateService: ReturnType<
    QuestionTodoRefreshRuntimePort['getSessionTodoStateService']
  > = {
    hasIncompleteTodos: jest.fn((todos: readonly SessionTodo[]) =>
      todos.some((todo) => todo.status !== 'completed'),
    ),
  };
  const sessionTodoStatusRefreshService: ReturnType<
    QuestionTodoRefreshRuntimePort['getSessionTodoStatusRefreshService']
  > = {
    refreshTabSessionStatus: jest
      .fn()
      .mockResolvedValue({ status: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
  };

  return {
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? runtime : null,
    ),
    renderSessionTodoDock: jest.fn(),
    getQuestionDockCoordinator: jest.fn().mockReturnValue(questionDockCoordinator),
    getSessionTodoStateService: jest.fn().mockReturnValue(sessionTodoStateService),
    getSessionTodoStatusRefreshService: jest
      .fn()
      .mockReturnValue(sessionTodoStatusRefreshService),
  };
}

function createQuestionTodoActivationWritebackPort():
  Mocked<QuestionTodoActivationWritebackPort> {
  const questionDockSlotCoordinator: ReturnType<
    QuestionTodoActivationWritebackPort['getQuestionDockSlotCoordinator']
  > = {
    render: jest.fn(),
  };
  const sessionTodoDockCoordinator: ReturnType<
    QuestionTodoActivationWritebackPort['getSessionTodoDockCoordinator']
  > = {
    updateForTab: jest.fn(),
  };

  return {
    getQuestionDockSlotCoordinator: jest.fn().mockReturnValue(questionDockSlotCoordinator),
    getSessionTodoDockCoordinator: jest.fn().mockReturnValue(sessionTodoDockCoordinator),
  };
}

function createBackgroundTaskRuntimePort(): Mocked<BackgroundTaskRuntimePort> {
  const backgroundTaskIndicatorCoordinator: ReturnType<
    BackgroundTaskRuntimePort['getBackgroundTaskIndicatorCoordinator']
  > = {
    flushCompletionNoticesAndSyncStreamLikeState: jest.fn().mockResolvedValue(undefined),
  };
  const backgroundTaskLiveSignalCoordinator: ReturnType<
    BackgroundTaskRuntimePort['getBackgroundTaskLiveSignalCoordinator']
  > = {
    markAuthoritativeSync: jest.fn(),
  };
  const tabRuntimeStateBridge: ReturnType<
    BackgroundTaskRuntimePort['getTabRuntimeStateBridge']
  > = {
    setNeedsAttention: jest.fn(),
  };

  return {
    resetBackgroundTaskIndicator: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    getBackgroundTaskIndicatorCoordinator: jest
      .fn()
      .mockReturnValue(backgroundTaskIndicatorCoordinator),
    getBackgroundTaskLiveSignalCoordinator: jest
      .fn()
      .mockReturnValue(backgroundTaskLiveSignalCoordinator),
    getTabRuntimeStateBridge: jest.fn().mockReturnValue(tabRuntimeStateBridge),
  };
}

function createFixture() {
  const initialConversationState = createConversationStatePort();
  const initialQuestionTodoRefreshRuntime = createQuestionTodoRefreshRuntimePort();
  const initialQuestionTodoActivationWriteback =
    createQuestionTodoActivationWritebackPort();
  const initialBackgroundTaskRuntime = createBackgroundTaskRuntimePort();
  let conversationState = initialConversationState;
  let questionTodoRefreshRuntime = initialQuestionTodoRefreshRuntime;
  let questionTodoActivationWriteback = initialQuestionTodoActivationWriteback;
  let backgroundTaskRuntime = initialBackgroundTaskRuntime;

  const host: Mocked<QuestionTodoBackgroundTaskRuntimeViewHostFactoryHost> = {
    getConversationState: jest.fn(() => conversationState),
    getQuestionTodoRefreshRuntime: jest.fn(() => questionTodoRefreshRuntime),
    getQuestionTodoActivationWriteback: jest.fn(() => questionTodoActivationWriteback),
    getBackgroundTaskRuntime: jest.fn(() => backgroundTaskRuntime),
  };

  return {
    host,
    initialBackgroundTaskRuntime,
    initialConversationState,
    initialQuestionTodoActivationWriteback,
    initialQuestionTodoRefreshRuntime,
    setBackgroundTaskRuntime: (next: Mocked<BackgroundTaskRuntimePort>) => {
      backgroundTaskRuntime = next;
    },
    setConversationState: (next: Mocked<ConversationStatePort>) => {
      conversationState = next;
    },
    setQuestionTodoActivationWriteback: (
      next: Mocked<QuestionTodoActivationWritebackPort>,
    ) => {
      questionTodoActivationWriteback = next;
    },
    setQuestionTodoRefreshRuntime: (next: Mocked<QuestionTodoRefreshRuntimePort>) => {
      questionTodoRefreshRuntime = next;
    },
  };
}

describe('QuestionTodoBackgroundTaskRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives the shared P2 view hosts from grouped ports', async () => {
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
      fixture.initialQuestionTodoRefreshRuntime.getTabRuntimeState.mock.results[0].value,
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

    expect(fixture.initialConversationState.setCurrentConversationRevertState)
      .toHaveBeenCalledWith({
        messageID: 'message-1',
      });
    expect(fixture.initialConversationState.setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-active', 'fingerprint-next');
    expect(fixture.initialQuestionTodoRefreshRuntime.getTabRuntimeState)
      .toHaveBeenCalledWith('tab-active');
    expect(
      fixture
        .initialQuestionTodoRefreshRuntime
        .getQuestionDockCoordinator
        .mock
        .results[0]
        .value
        .refreshPendingQuestionsForTab,
    ).toHaveBeenCalledWith('tab-active', 'session-question');
    expect(
      fixture
        .initialQuestionTodoRefreshRuntime
        .getSessionTodoStateService
        .mock
        .results[0]
        .value
        .hasIncompleteTodos,
    ).toHaveBeenCalledWith([
      { id: 'todo-1', content: 'Todo', status: 'pending' },
    ]);
    expect(
      fixture
        .initialQuestionTodoRefreshRuntime
        .getSessionTodoStatusRefreshService
        .mock
        .results[0]
        .value
        .refreshTabSessionStatus,
    ).toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
    expect(
      fixture
        .initialQuestionTodoRefreshRuntime
        .getSessionTodoStatusRefreshService
        .mock
        .results[1]
        .value
        .refreshTabSessionTodos,
    ).toHaveBeenCalledWith('tab-active', 'session-status', { suppressErrors: true });
    expect(fixture.initialBackgroundTaskRuntime.syncBackgroundTaskStateFromConversation)
      .toHaveBeenNthCalledWith(1, conversation, 'tab-active');
    expect(
      fixture
        .initialBackgroundTaskRuntime
        .getBackgroundTaskIndicatorCoordinator
        .mock
        .results[0]
        .value
        .flushCompletionNoticesAndSyncStreamLikeState,
    ).toHaveBeenCalledWith('tab-active', conversation);
    expect(
      fixture
        .initialBackgroundTaskRuntime
        .getBackgroundTaskLiveSignalCoordinator
        .mock
        .results[0]
        .value
        .markAuthoritativeSync,
    ).toHaveBeenCalledWith('tab-active', 'session.diff');
    expect(
      fixture
        .initialBackgroundTaskRuntime
        .getTabRuntimeStateBridge
        .mock
        .results[0]
        .value
        .setNeedsAttention,
    ).toHaveBeenCalledWith('tab-active', true);
    expect(
      fixture
        .initialQuestionTodoActivationWriteback
        .getQuestionDockSlotCoordinator
        .mock
        .results[0]
        .value
        .render,
    ).toHaveBeenCalledTimes(1);
    expect(
      fixture
        .initialQuestionTodoActivationWriteback
        .getSessionTodoDockCoordinator
        .mock
        .results[0]
        .value
        .updateForTab,
    ).toHaveBeenCalledWith('tab-active');
    expect(fixture.initialQuestionTodoRefreshRuntime.renderSessionTodoDock)
      .toHaveBeenCalledWith('tab-active');
    expect(fixture.initialBackgroundTaskRuntime.resetBackgroundTaskIndicator)
      .toHaveBeenCalledTimes(1);
    expect(fixture.initialBackgroundTaskRuntime.syncBackgroundTaskStateFromConversation)
      .toHaveBeenNthCalledWith(2, conversation, 'tab-active');
    expect(fixture.initialBackgroundTaskRuntime.renderBackgroundTaskIndicatorIfNeeded)
      .toHaveBeenCalledWith('tab-active');
  });

  it('uses the latest grouped ports returned by the factory host', async () => {
    const fixture = createFixture();
    const {
      visibleConversationPostSyncStateViewHost,
      questionTodoBackgroundTaskRefreshViewHost,
      backgroundConversationPostSyncHandoffViewHost,
      questionTodoBackgroundTaskActivationViewHost,
    } = createQuestionTodoBackgroundTaskRuntimeViewHosts(fixture.host);
    const nextConversationState = createConversationStatePort('conversation-next');
    const nextQuestionTodoRefreshRuntime = createQuestionTodoRefreshRuntimePort(
      createRuntime({
        sessionTodos: [{ id: 'todo-2', content: 'Next', status: 'pending' }],
      }),
    );
    const nextQuestionTodoActivationWriteback =
      createQuestionTodoActivationWritebackPort();
    const nextBackgroundTaskRuntime = createBackgroundTaskRuntimePort();

    fixture.setConversationState(nextConversationState);
    fixture.setQuestionTodoRefreshRuntime(nextQuestionTodoRefreshRuntime);
    fixture.setQuestionTodoActivationWriteback(nextQuestionTodoActivationWriteback);
    fixture.setBackgroundTaskRuntime(nextBackgroundTaskRuntime);

    expect(visibleConversationPostSyncStateViewHost.getCurrentConversation()).toEqual(
      createConversation('conversation-next'),
    );
    visibleConversationPostSyncStateViewHost.setCurrentConversationRevertState(null);
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

    expect(fixture.initialConversationState.getCurrentConversation).not.toHaveBeenCalled();
    expect(nextConversationState.getCurrentConversation).toHaveBeenCalledTimes(1);
    expect(fixture.initialConversationState.setCurrentConversationRevertState)
      .not.toHaveBeenCalled();
    expect(nextConversationState.setCurrentConversationRevertState).toHaveBeenCalledWith(null);
    expect(
      fixture
        .initialQuestionTodoRefreshRuntime
        .getSessionTodoStatusRefreshService
        .mock
        .results,
    ).toHaveLength(0);
    expect(
      nextQuestionTodoRefreshRuntime
        .getSessionTodoStatusRefreshService
        .mock
        .results[0]
        .value
        .refreshTabSessionTodos,
    ).toHaveBeenCalledWith('tab-next', 'session-next', { suppressErrors: true });
    expect(
      fixture
        .initialQuestionTodoActivationWriteback
        .getQuestionDockSlotCoordinator
        .mock
        .results,
    ).toHaveLength(0);
    expect(
      nextQuestionTodoActivationWriteback
        .getQuestionDockSlotCoordinator
        .mock
        .results[0]
        .value
        .render,
    ).toHaveBeenCalledTimes(1);
    expect(
      fixture
        .initialBackgroundTaskRuntime
        .getBackgroundTaskLiveSignalCoordinator
        .mock
        .results,
    ).toHaveLength(0);
    expect(
      nextBackgroundTaskRuntime
        .getBackgroundTaskLiveSignalCoordinator
        .mock
        .results[0]
        .value
        .markAuthoritativeSync,
    ).toHaveBeenCalledWith('tab-next', 'message.updated');
  });
});
