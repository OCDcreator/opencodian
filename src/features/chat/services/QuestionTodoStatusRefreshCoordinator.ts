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
  getCurrentConversationBackend(): string;
  refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options?: { isCurrent?: () => boolean },
  ): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean; isCurrent?: () => boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean; isCurrent?: () => boolean },
  ): Promise<SessionTodo[]>;
}

export interface PostSyncQuestionTodoStatusRefreshOptions {
  tabId: TabId | null;
  questionSessionId: string | null | undefined;
  todoStatusSessionId: string | null | undefined;
  forceTodoStatusRefresh?: boolean;
  afterPendingQuestionRefresh?: (() => void | Promise<void>) | null;
  /** Captured post-sync lease; subsequent refresh stages must stop once stale. */
  isCurrent?: () => boolean;
}

export class QuestionTodoStatusRefreshCoordinator {
  constructor(private readonly host: QuestionTodoStatusRefreshCoordinatorHost) {}

  async refreshAfterActivation(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { isCurrent?: () => boolean } = {},
  ): Promise<void> {
    const isCurrent = options.isCurrent ?? (() => true);
    if (!isCurrent()) {
      return;
    }
    const backend = this.host.getCurrentConversationBackend();
    // Pending-questions REST polling is OpenCode-only.
    // For non-OpenCode backends, questions arrive through SDK callbacks,
    // not REST polling. Skip the REST call to avoid leaking.
    const pendingQuestionsPromise = backend === 'opencode'
      ? options.isCurrent
        ? this.host.refreshPendingQuestionsForTab(tabId, sessionId, options)
        : this.host.refreshPendingQuestionsForTab(tabId, sessionId)
      : Promise.resolve([] as QuestionRequest[]);

    const statusPromise = options.isCurrent
      ? this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true, isCurrent })
      : this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
    const todoPromise = options.isCurrent
      ? this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true, isCurrent })
      : this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true });
    await Promise.allSettled([statusPromise, pendingQuestionsPromise, todoPromise]);
  }

  async refreshAfterPostSync(
    options: PostSyncQuestionTodoStatusRefreshOptions,
  ): Promise<void> {
    const isCurrent = options.isCurrent ?? (() => true);
    if (!isCurrent()) {
      return;
    }
    const backend = this.host.getCurrentConversationBackend();
    // Pending-questions REST polling is OpenCode-only (see refreshAfterActivation).
    if (backend === 'opencode') {
      if (options.isCurrent) {
        await this.host.refreshPendingQuestionsForTab(
          options.tabId,
          options.questionSessionId,
          { isCurrent },
        );
      } else {
        await this.host.refreshPendingQuestionsForTab(options.tabId, options.questionSessionId);
      }
    }
    if (!isCurrent()) {
      return;
    }
    await options.afterPendingQuestionRefresh?.();

    if (!isCurrent()) {
      return;
    }

    if (!this.shouldRefreshTodoStatus(options.tabId, options.forceTodoStatusRefresh ?? false)) {
      return;
    }

    await this.host.refreshTabSessionStatus(
      options.tabId,
      options.todoStatusSessionId,
      options.isCurrent ? { suppressErrors: true, isCurrent } : { suppressErrors: true },
    );
    if (!isCurrent()) {
      return;
    }
    await this.host.refreshTabSessionTodos(
      options.tabId,
      options.todoStatusSessionId,
      options.isCurrent ? { suppressErrors: true, isCurrent } : { suppressErrors: true },
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
