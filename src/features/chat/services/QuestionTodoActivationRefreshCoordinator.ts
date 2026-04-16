import type { TabId } from '../tabs';
import type { QuestionTodoStatusRefreshCoordinator } from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

export interface QuestionTodoActivationRefreshCoordinatorHost {
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId | null): void;
}

export class QuestionTodoActivationRefreshCoordinator {
  constructor(
    private readonly host: QuestionTodoActivationRefreshCoordinatorHost,
    private readonly questionTodoStatusRefresh: QuestionTodoActivationRefreshPort,
  ) {}

  applyActivationPreflight(tabId: TabId): void {
    this.host.renderQuestionDock();
    this.host.updateSessionTodoDockForTab(tabId);
  }

  applyConversationActivation(
    tabId: TabId | null,
    sessionId: string | null | undefined,
  ): void {
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
    void this.questionTodoStatusRefresh.refreshAfterActivation(tabId, sessionId);
  }

  applyEmptyActivation(tabId: TabId): void {
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
  }
}
