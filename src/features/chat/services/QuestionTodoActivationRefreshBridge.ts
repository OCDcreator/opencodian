import type { SessionActivityStatus } from '../../../core/opencode';
import type { QuestionRequest, SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';

export interface QuestionTodoActivationRefreshBridgeHost {
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

export class QuestionTodoActivationRefreshBridge {
  constructor(private readonly host: QuestionTodoActivationRefreshBridgeHost) {}

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
}
