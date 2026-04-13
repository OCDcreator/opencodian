import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../../src/core/types';
import type {
  BackgroundConversationPostSyncHandoffViewHost,
} from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter';
import {
  createQuestionTodoBackgroundTaskRefreshHosts,
  createQuestionTodoBackgroundTaskRefreshServices,
  createQuestionTodoBackgroundTaskRefreshViewHostAdapter,
  type QuestionTodoBackgroundTaskRefreshViewHostAdapterHost,
  type QuestionTodoBackgroundTaskRefreshViewHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { QuestionTodoStatusRefreshRuntime } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
import type {
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncStateCoordinator,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id = 'conversation-active',
  overrides?: Partial<Conversation>,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
    ...overrides,
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

function createViewHost(options?: {
  currentConversation?: Conversation | null;
  runtimes?: Record<string, QuestionTodoStatusRefreshRuntime | null>;
}): Mocked<QuestionTodoBackgroundTaskRefreshViewHost> {
  const currentConversation =
    options?.currentConversation ?? createConversation('conversation-active');
  const runtimes = new Map<string, QuestionTodoStatusRefreshRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-active': createRuntime(),
    }),
  );

  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
    hasIncompleteTodos: jest.fn((todos: readonly SessionTodo[]) =>
      todos.some((todo) => todo.status !== 'completed'),
    ),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    refreshTabSessionStatus: jest
      .fn()
      .mockResolvedValue({ status: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
  };
}

function createViewHostAdapterHost(options?: {
  currentConversation?: Conversation | null;
  runtimes?: Record<string, QuestionTodoStatusRefreshRuntime | null>;
}): Mocked<QuestionTodoBackgroundTaskRefreshViewHostAdapterHost> {
  const currentConversation =
    options?.currentConversation ?? createConversation('conversation-active');
  const runtimes = new Map<string, QuestionTodoStatusRefreshRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-active': createRuntime(),
    }),
  );

  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
  };
}

function createBackgroundConversationPostSyncHandoffViewHost():
  Mocked<BackgroundConversationPostSyncHandoffViewHost> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(),
    flushBackgroundTaskPostSyncWriteback: jest.fn().mockResolvedValue(undefined),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

function createVisibleConversationPostSyncStateCoordinator(
  outcome: VisibleConversationPostSyncOutcome = {
    shouldApplySyncedConversationUpdate: true,
    shouldRenderBackgroundTaskIndicator: false,
  },
): jest.Mocked<VisibleConversationPostSyncStatePort> {
  return {
    commitPostSyncState: jest.fn().mockReturnValue(outcome),
  };
}

describe('QuestionTodoBackgroundTaskRefreshHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adapts late-bound question/todo refresh ports into one refresh view host', async () => {
    const currentConversation = createConversation('conversation-active');
    const runtime = createRuntime();
    const viewHost = createViewHostAdapterHost({
      currentConversation,
      runtimes: {
        'tab-active': runtime,
      },
    });

    let questionDockCoordinator!: {
      refreshPendingQuestionsForTab: jest.Mock<Promise<QuestionRequest[]>, [string | null, string | null | undefined]>;
    };
    let sessionTodoCoordinator!: {
      hasIncompleteTodos: jest.Mock<boolean, [readonly SessionTodo[]]>;
      refreshTabSessionStatus: jest.Mock<
        Promise<SessionActivityStatus | null>,
        [string | null, string | null | undefined, { suppressErrors?: boolean }]
      >;
      refreshTabSessionTodos: jest.Mock<
        Promise<SessionTodo[]>,
        [string | null, string | null | undefined, { suppressErrors?: boolean }]
      >;
    };

    const adaptedViewHost = createQuestionTodoBackgroundTaskRefreshViewHostAdapter({
      viewHost,
      getQuestionDockCoordinator: () => questionDockCoordinator,
      getSessionTodoCoordinator: () => sessionTodoCoordinator,
    });

    questionDockCoordinator = {
      refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    };
    sessionTodoCoordinator = {
      hasIncompleteTodos: jest.fn().mockImplementation((todos: readonly SessionTodo[]) =>
        todos.some((todo) => todo.status !== 'completed'),
      ),
      refreshTabSessionStatus: jest
        .fn()
        .mockResolvedValue({ type: 'idle' } as SessionActivityStatus),
      refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    };

    expect(adaptedViewHost.getCurrentConversation()).toBe(currentConversation);
    expect(adaptedViewHost.getTabRuntimeState('tab-active')).toBe(runtime);
    expect(
      adaptedViewHost.hasIncompleteTodos([
        { id: 'todo-1', content: 'Answer', status: 'pending' },
      ]),
    ).toBe(true);

    await adaptedViewHost.refreshPendingQuestionsForTab('tab-active', 'session-question');
    await adaptedViewHost.refreshTabSessionStatus(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    await adaptedViewHost.refreshTabSessionTodos(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );

    expect(questionDockCoordinator.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'session-question',
    );
    expect(sessionTodoCoordinator.hasIncompleteTodos).toHaveBeenCalledWith([
      { id: 'todo-1', content: 'Answer', status: 'pending' },
    ]);
    expect(sessionTodoCoordinator.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    expect(sessionTodoCoordinator.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
  });

  it('derives activation refresh host from one shared view host', async () => {
    const runtime = createRuntime();
    const viewHost = createViewHost({
      runtimes: {
        'tab-active': runtime,
      },
    });

    const hosts = createQuestionTodoBackgroundTaskRefreshHosts(viewHost);

    await hosts.questionTodoActivationRefreshHost.refreshPendingQuestionsForTab(
      'tab-active',
      'session-activation',
    );
    await hosts.questionTodoActivationRefreshHost.refreshTabSessionStatus(
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );
    await hosts.questionTodoActivationRefreshHost.refreshTabSessionTodos(
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'session-activation',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenNthCalledWith(
      1,
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenNthCalledWith(
      1,
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );
  });

  it('wires visible sync refresh through the shared current-conversation session bridge', async () => {
    const runtime = createRuntime({
      sessionTodos: [{ id: 'todo-1', content: 'Refresh', status: 'pending' }],
    });
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHost({
      currentConversation,
      runtimes: {
        'tab-active': runtime,
      },
    });
    const visibleConversationPostSyncStateCoordinator =
      createVisibleConversationPostSyncStateCoordinator();
    const backgroundConversationPostSyncHandoffViewHost =
      createBackgroundConversationPostSyncHandoffViewHost();

    const services = createQuestionTodoBackgroundTaskRefreshServices(
      viewHost,
      backgroundConversationPostSyncHandoffViewHost,
      visibleConversationPostSyncStateCoordinator,
    );

    await services.questionTodoActivationRefreshBridge.refreshAfterActivation(
      'tab-active',
      'session-activation',
    );

    const outcome =
      await services.visibleConversationPostSyncCoordinator.handleVisibleConversationSyncComplete({
        tabId: 'tab-active',
        expectedConversationId: 'conversation-active',
        questionSessionId: 'question-session',
        syncResult: {
          changed: true,
          fingerprint: 'next-visible-fingerprint',
          revertState: { messageID: 'assistant-visible' },
        },
      });

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'session-activation',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenNthCalledWith(
      1,
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenNthCalledWith(
      1,
      'tab-active',
      'session-activation',
      { suppressErrors: true },
    );
    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'question-session',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenNthCalledWith(
      2,
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenNthCalledWith(
      2,
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
    expect(
      visibleConversationPostSyncStateCoordinator.commitPostSyncState,
    ).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-active',
      syncResult: {
        changed: true,
        fingerprint: 'next-visible-fingerprint',
        revertState: { messageID: 'assistant-visible' },
      },
    });
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });
});
