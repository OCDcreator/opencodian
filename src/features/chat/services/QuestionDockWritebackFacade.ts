import type { QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';

export interface QuestionDockWritebackFacadeHost {
  getActiveTabId(): TabId | null;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  renderQuestionDock(): void;
}

export class QuestionDockWritebackFacade {
  constructor(private readonly host: QuestionDockWritebackFacadeHost) {}

  applyEnqueuedPendingQuestionRequest(tabId: TabId | null): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, true);
  }

  applyRemovedPendingQuestionRequest(
    tabId: TabId | null,
    remainingRequests: readonly QuestionRequest[],
  ): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, remainingRequests.length > 0);
  }

  applyClearedPendingQuestions(tabId: TabId | null): void {
    this.applyRemovedPendingQuestionRequest(tabId, []);
  }

  applyRefreshedPendingQuestions(
    tabId: TabId | null,
    mergedRequests: readonly QuestionRequest[],
  ): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, mergedRequests.length > 0);
  }

  private applyActiveTabDockWriteback(tabId: TabId | null): void {
    this.host.setTabNeedsAttention(tabId, false);
    this.host.renderQuestionDock();
  }

  private isActiveTab(tabId: TabId | null): boolean {
    return tabId === this.host.getActiveTabId();
  }
}
