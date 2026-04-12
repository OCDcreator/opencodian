import type { Conversation } from '../../../core/types';
import type { QuestionTodoStatusRefreshCoordinator } from '../services/QuestionTodoStatusRefreshCoordinator';
import type { TabId } from '../tabs';
import type { TabConversationStateBridge } from './TabConversationStateBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'applyActiveConversation' | 'commitConversationSyncBaseline'
>;

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

export interface CurrentTabConversationOpenBridgeHost {
  getCurrentConversationId(): string | null;
  getActiveTabId(): TabId | null;
  resetBackgroundTaskIndicator(): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  renderQuestionDock(): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export class CurrentTabConversationOpenBridge {
  constructor(
    private readonly host: CurrentTabConversationOpenBridgeHost,
    private readonly tabConversationStateBridge: TabConversationStatePort,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
  ) {}

  openConversation(conversation: Conversation): void {
    if (this.host.getCurrentConversationId() !== conversation.id) {
      this.host.resetBackgroundTaskIndicator();
    }

    const activeTabId = this.host.getActiveTabId();
    this.tabConversationStateBridge.applyActiveConversation(activeTabId, conversation, {
      clearRevertState: true,
      resetSessionState: true,
    });
    this.host.clearMessagesContainer();
    this.host.resetTurnState();
    this.tabConversationStateBridge.commitConversationSyncBaseline(conversation.messages);
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.host.syncBackgroundTaskStateFromConversation(conversation, activeTabId);
    this.host.renderSessionTodoDock(activeTabId);
    this.host.renderQuestionDock();
    void this.questionTodoStatusRefreshCoordinator.refreshAfterActivation(
      activeTabId,
      conversation.openCodeSessionId,
    );
    void this.host.renderBackgroundTaskIndicatorIfNeeded(activeTabId);
    void this.host.refreshActiveTabContextUsageFromServer();
    this.host.scheduleSettledScrollToBottom(activeTabId);
  }
}
