import type { QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';

export interface QuestionPendingRefreshWritebackFacadeHost {
  getActiveTabId(): TabId | null;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  renderQuestionDock(): void;
}

export class QuestionPendingRefreshWritebackFacade {
  constructor(private readonly host: QuestionPendingRefreshWritebackFacadeHost) {}

  applyClearedPendingQuestions(tabId: TabId | null): void {
    this.host.setTabNeedsAttention(tabId, false);

    if (this.isActiveTab(tabId)) {
      this.host.renderQuestionDock();
    }
  }

  applyRefreshedPendingQuestions(
    tabId: TabId | null,
    mergedRequests: readonly QuestionRequest[],
  ): void {
    if (this.isActiveTab(tabId)) {
      this.host.setTabNeedsAttention(tabId, false);
      this.host.renderQuestionDock();
      return;
    }

    this.host.setTabNeedsAttention(tabId, mergedRequests.length > 0);
  }

  private isActiveTab(tabId: TabId | null): boolean {
    return tabId === this.host.getActiveTabId();
  }
}
