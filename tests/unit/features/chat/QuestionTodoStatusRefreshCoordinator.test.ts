import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { QuestionRequest, SessionTodo } from '../../../../src/core/types';
import {
  QuestionTodoStatusRefreshCoordinator,
  type QuestionTodoStatusRefreshCoordinatorHost,
  type QuestionTodoStatusRefreshRuntime,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type MockedQuestionTodoStatusRefreshHost = {
  [Key in keyof QuestionTodoStatusRefreshCoordinatorHost]:
    QuestionTodoStatusRefreshCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : QuestionTodoStatusRefreshCoordinatorHost[Key];
};

function createTodo(status: SessionTodo['status']): SessionTodo {
  return {
    id: `todo-${status}`,
    content: 'Search docs',
    status,
    priority: 'medium',
  };
}

function createRuntime(
  overrides: Partial<QuestionTodoStatusRefreshRuntime> = {},
): QuestionTodoStatusRefreshRuntime {
  return {
    sessionTodos: [],
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    ...overrides,
  };
}

function createHost(options: {
  runtime?: QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos?: boolean;
  callOrder?: string[];
} = {}): MockedQuestionTodoStatusRefreshHost {
  const callOrder = options.callOrder;
  return {
    getTabRuntimeState: jest.fn().mockReturnValue(options.runtime ?? createRuntime()),
    hasIncompleteTodos: jest.fn().mockReturnValue(options.hasIncompleteTodos ?? false),
    refreshPendingQuestionsForTab: jest.fn(() => {
      callOrder?.push('pending-question');
      return Promise.resolve([] as QuestionRequest[]);
    }),
    refreshTabSessionStatus: jest.fn(() => {
      callOrder?.push('status');
      return Promise.resolve({ type: 'idle' } as SessionActivityStatus);
    }),
    refreshTabSessionTodos: jest.fn(() => {
      callOrder?.push('todo');
      return Promise.resolve([] as SessionTodo[]);
    }),
  };
}

describe('QuestionTodoStatusRefreshCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts activation status, question, and todo refreshes in the existing order', async () => {
    const callOrder: string[] = [];
    const host = createHost({ callOrder });
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

    await coordinator.refreshAfterActivation('tab-1', 'session-1');

    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(callOrder).toEqual(['status', 'pending-question', 'todo']);
  });

  it('runs post-sync pending questions before background reconciliation and todo/status refresh', async () => {
    const callOrder: string[] = [];
    const host = createHost({
      runtime: createRuntime({ sessionTodos: [createTodo('pending')] }),
      hasIncompleteTodos: true,
      callOrder,
    });
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

    await coordinator.refreshAfterPostSync({
      tabId: 'tab-1',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'todo-session',
      afterPendingQuestionRefresh: () => {
        callOrder.push('reconcile');
      },
    });

    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'question-session');
    expect(host.hasIncompleteTodos).toHaveBeenCalledWith([createTodo('pending')]);
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'todo-session',
      { suppressErrors: true },
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'todo-session',
      { suppressErrors: true },
    );
    expect(callOrder).toEqual(['pending-question', 'reconcile', 'status', 'todo']);
  });

  it('skips post-sync todo/status refresh when runtime has no incomplete work', async () => {
    const callOrder: string[] = [];
    const host = createHost({ callOrder });
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

    await coordinator.refreshAfterPostSync({
      tabId: 'tab-1',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      afterPendingQuestionRefresh: () => {
        callOrder.push('reconcile');
      },
    });

    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['pending-question', 'reconcile']);
  });

  it('forces post-sync todo/status refresh when a background sync requires it', async () => {
    const callOrder: string[] = [];
    const host = createHost({ callOrder });
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

    await coordinator.refreshAfterPostSync({
      tabId: 'tab-1',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: true,
    });

    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(callOrder).toEqual(['pending-question', 'status', 'todo']);
  });

  it('refreshes todo/status when background-task launches keep the runtime active', async () => {
    const callOrder: string[] = [];
    const host = createHost({
      runtime: createRuntime({
        backgroundTaskLaunches: new Map([['launch-1', { source: 'sync' }]]),
      }),
      callOrder,
    });
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

    await coordinator.refreshAfterPostSync({
      tabId: 'tab-1',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
    });

    expect(host.hasIncompleteTodos).toHaveBeenCalledWith([]);
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(callOrder).toEqual(['pending-question', 'status', 'todo']);
  });
});
