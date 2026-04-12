import type { Conversation } from '../../../core/types';
import type { QuestionTodoStatusRefreshCoordinator } from '../services/QuestionTodoStatusRefreshCoordinator';
import type { TabId } from '../tabs';
import type { TabConversationStateBridge } from './TabConversationStateBridge';
import type { TabViewActivationBridge } from './TabViewActivationBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'applyActiveConversation' | 'clearActiveConversation' | 'commitConversationSyncBaseline'
>;

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

type TabViewActivationPort = Pick<
  TabViewActivationBridge,
  'applyEmptyActivationOutcome' | 'applyStreamingActivationOutcome'
>;

export interface TabConversationActivationBridgeHost {
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

export class TabConversationActivationBridge {
  constructor(
    private readonly host: TabConversationActivationBridgeHost,
    private readonly tabConversationStateBridge: TabConversationStatePort,
    private readonly tabViewActivationBridge: TabViewActivationPort,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
  ) {}

  applyEmptyTabActivation(tabId: TabId): void {
    this.tabConversationStateBridge.clearActiveConversation(tabId);
    this.resetActivePaneShell();
    this.tabViewActivationBridge.applyEmptyActivationOutcome(tabId);
  }

  applyStreamingConversationActivation(tabId: TabId, conversation: Conversation): void {
    this.tabConversationStateBridge.applyActiveConversation(tabId, conversation, {
      clearRevertState: true,
      resetSessionState: true,
    });
    this.tabConversationStateBridge.commitConversationSyncBaseline(conversation.messages);
    this.tabViewActivationBridge.applyStreamingActivationOutcome(
      tabId,
      conversation.openCodeSessionId,
    );
  }

  openConversation(conversation: Conversation): void {
    if (this.host.getCurrentConversationId() !== conversation.id) {
      this.host.resetBackgroundTaskIndicator();
    }

    const activeTabId = this.host.getActiveTabId();
    this.tabConversationStateBridge.applyActiveConversation(activeTabId, conversation, {
      clearRevertState: true,
      resetSessionState: true,
    });
    this.resetActivePaneShell();
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

  private resetActivePaneShell(): void {
    this.host.clearMessagesContainer();
    this.host.resetTurnState();
  }
}
