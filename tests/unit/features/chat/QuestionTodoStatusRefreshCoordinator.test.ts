/* eslint-disable max-lines-per-function -- activation and post-sync lease cases share one fixture matrix. */
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
  backend?: string;
} = {}): MockedQuestionTodoStatusRefreshHost {
  const callOrder = options.callOrder;
  return {
    getTabRuntimeState: jest.fn().mockReturnValue(options.runtime ?? createRuntime()),
    hasIncompleteTodos: jest.fn().mockReturnValue(options.hasIncompleteTodos ?? false),
    getCurrentConversationBackend: jest.fn().mockReturnValue(options.backend ?? 'opencode'),
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
    expect(callOrder).toEqual(['pending-question', 'status', 'todo']);
  });

  it('does not write activation refresh results after its tab/session lease expires', async () => {
    const host = createHost();
    let resolvePending: ((value: QuestionRequest[]) => void) | undefined;
    host.refreshPendingQuestionsForTab.mockReturnValue(new Promise((resolve) => {
      resolvePending = resolve;
    }));
    let current = true;
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);
    const refreshPromise = coordinator.refreshAfterActivation('tab-1', 'session-a', {
      isCurrent: () => current,
    });

    current = false;
    resolvePending?.([]);
    await refreshPromise;

    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-1',
      'session-a',
      { isCurrent: expect.any(Function) },
    );
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'session-a',
      { suppressErrors: true, isCurrent: expect.any(Function) },
    );
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

  it('stops all later post-sync stages when the lease expires after pending questions', async () => {
    const host = createHost({
      runtime: createRuntime({ sessionTodos: [createTodo('pending')] }),
      hasIncompleteTodos: true,
    });
    let resolvePending: ((value: QuestionRequest[]) => void) | undefined;
    host.refreshPendingQuestionsForTab.mockReturnValue(new Promise((resolve) => {
      resolvePending = resolve;
    }));
    let current = true;
    const afterPendingQuestionRefresh = jest.fn();
    const coordinator = new QuestionTodoStatusRefreshCoordinator(host);
    const refreshPromise = coordinator.refreshAfterPostSync({
      tabId: 'tab-1',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'todo-session',
      afterPendingQuestionRefresh,
      isCurrent: () => current,
      forceTodoStatusRefresh: true,
    });

    current = false;
    resolvePending?.([]);
    await refreshPromise;

    expect(afterPendingQuestionRefresh).not.toHaveBeenCalled();
    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
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

  describe('non-OpenCode backend guard', () => {
    it('skips pending-questions REST poll for non-OpenCode activation', async () => {
      const host = createHost({ backend: 'claude-code' });
      const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

      await coordinator.refreshAfterActivation('tab-1', 'session-1');

      expect(host.refreshPendingQuestionsForTab).not.toHaveBeenCalled();
      // status and todo still refresh (they gate internally)
      expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
        'tab-1', 'session-1', { suppressErrors: true },
      );
      expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
        'tab-1', 'session-1', { suppressErrors: true },
      );
    });

    it('skips pending-questions REST poll for non-OpenCode post-sync', async () => {
      const host = createHost({ backend: 'claude-code' });
      const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

      await coordinator.refreshAfterPostSync({
        tabId: 'tab-1',
        questionSessionId: 'session-1',
        todoStatusSessionId: 'session-1',
      });

      expect(host.refreshPendingQuestionsForTab).not.toHaveBeenCalled();
    });

    it('still runs afterPendingQuestionRefresh callback for non-OpenCode post-sync', async () => {
      const host = createHost({ backend: 'claude-code' });
      const afterRefresh = jest.fn();
      const coordinator = new QuestionTodoStatusRefreshCoordinator(host);

      await coordinator.refreshAfterPostSync({
        tabId: 'tab-1',
        questionSessionId: 'session-1',
        todoStatusSessionId: 'session-1',
        afterPendingQuestionRefresh: afterRefresh,
      });

      expect(afterRefresh).toHaveBeenCalled();
    });
  });
});
