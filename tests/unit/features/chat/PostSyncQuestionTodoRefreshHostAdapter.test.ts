import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../../src/core/types';
import {
  createPostSyncQuestionTodoRefreshHosts,
  createPostSyncQuestionTodoRefreshServices,
  type PostSyncQuestionTodoRefreshViewHost,
} from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshHostAdapter';
import type { QuestionTodoStatusRefreshRuntime } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

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
}): Mocked<PostSyncQuestionTodoRefreshViewHost> {
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

describe('PostSyncQuestionTodoRefreshHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives question/todo post-sync hosts from one shared view host', async () => {
    const runtime = createRuntime();
    const viewHost = createViewHost({
      currentConversation: createConversation('conversation-active'),
      runtimes: {
        'tab-active': runtime,
      },
    });

    const hosts = createPostSyncQuestionTodoRefreshHosts(viewHost);

    expect(hosts.questionTodoStatusRefreshHost.getTabRuntimeState('tab-active')).toBe(runtime);
    expect(hosts.postSyncQuestionTodoRefreshPlanBuilderHost.getCurrentConversationSessionId()).toBe(
      'session-conversation-active',
    );

    await hosts.questionTodoStatusRefreshHost.refreshPendingQuestionsForTab(
      'tab-active',
      'session-question',
    );
    await hosts.questionTodoStatusRefreshHost.refreshTabSessionStatus(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    await hosts.questionTodoStatusRefreshHost.refreshTabSessionTodos(
      'tab-active',
      'session-todo',
      { suppressErrors: true },
    );
    hosts.questionTodoStatusRefreshHost.hasIncompleteTodos([
      { id: 'todo-1', content: 'Refresh', status: 'pending' },
    ]);

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'session-question',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-active',
      'session-todo',
      { suppressErrors: true },
    );
    expect(viewHost.hasIncompleteTodos).toHaveBeenCalledWith([
      { id: 'todo-1', content: 'Refresh', status: 'pending' },
    ]);
  });

  it('wires visible refresh services through the current-conversation session bridge', async () => {
    const viewHost = createViewHost({
      currentConversation: createConversation('conversation-active'),
      runtimes: {
        'tab-active': createRuntime({
          sessionTodos: [{ id: 'todo-1', content: 'Refresh', status: 'pending' }],
        }),
      },
    });

    const services = createPostSyncQuestionTodoRefreshServices(viewHost);

    await services.postSyncQuestionTodoRefreshFacade.refreshVisibleConversation({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'question-session',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
  });
});
