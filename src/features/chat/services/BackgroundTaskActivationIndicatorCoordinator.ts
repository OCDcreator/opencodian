import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';

export interface BackgroundTaskActivationIndicatorCoordinatorHost {
  getCurrentConversationId(): string | null;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export class BackgroundTaskActivationIndicatorCoordinator {
  constructor(private readonly host: BackgroundTaskActivationIndicatorCoordinatorHost) {}

  prepareOpenConversation(conversation: Conversation): void {
    if (this.host.getCurrentConversationId() !== conversation.id) {
      this.host.resetBackgroundTaskIndicator();
    }
  }

  syncOpenConversationState(conversation: Conversation, tabId: TabId | null): void {
    this.host.syncBackgroundTaskStateFromConversation(conversation, tabId);
  }

  renderOpenConversationIndicator(tabId: TabId | null): void {
    void this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }

  async renderLoadedConversationIndicator(tabId: TabId | null): Promise<void> {
    await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
  }
}
