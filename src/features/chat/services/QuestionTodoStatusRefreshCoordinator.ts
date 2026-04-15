import type { SessionActivityStatus } from '../../../core/opencode';
import type { QuestionRequest, SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';

export interface QuestionTodoStatusRefreshRuntime {
  sessionTodos: readonly SessionTodo[];
  backgroundTaskLaunches: ReadonlyMap<string, unknown>;
  backgroundTaskWaitingForFollowUp: boolean;
}

export interface QuestionTodoStatusRefreshCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined,
  ): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
}

export interface PostSyncQuestionTodoStatusRefreshOptions {
  tabId: TabId | null;
  questionSessionId: string | null | undefined;
  todoStatusSessionId: string | null | undefined;
  forceTodoStatusRefresh?: boolean;
  afterPendingQuestionRefresh?: (() => void | Promise<void>) | null;
}

export class QuestionTodoStatusRefreshCoordinator {
  constructor(private readonly host: QuestionTodoStatusRefreshCoordinatorHost) {}

  async refreshAfterActivation(
    tabId: TabId | null,
    sessionId: string | null | undefined,
  ): Promise<void> {
    await Promise.allSettled([
      this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true }),
      this.host.refreshPendingQuestionsForTab(tabId, sessionId),
      this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true }),
    ]);
  }

  async refreshAfterPostSync(
    options: PostSyncQuestionTodoStatusRefreshOptions,
  ): Promise<void> {
    await this.host.refreshPendingQuestionsForTab(options.tabId, options.questionSessionId);
    await options.afterPendingQuestionRefresh?.();

    if (!this.shouldRefreshTodoStatus(options.tabId, options.forceTodoStatusRefresh ?? false)) {
      return;
    }

    await this.host.refreshTabSessionStatus(
      options.tabId,
      options.todoStatusSessionId,
      { suppressErrors: true },
    );
    await this.host.refreshTabSessionTodos(
      options.tabId,
      options.todoStatusSessionId,
      { suppressErrors: true },
    );
  }

  private shouldRefreshTodoStatus(tabId: TabId | null, forceTodoStatusRefresh: boolean): boolean {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    return forceTodoStatusRefresh
      || this.host.hasIncompleteTodos(runtime.sessionTodos)
      || runtime.backgroundTaskLaunches.size > 0
      || runtime.backgroundTaskWaitingForFollowUp;
  }
}
