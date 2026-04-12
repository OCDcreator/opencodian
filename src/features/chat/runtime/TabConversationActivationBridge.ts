import type { Conversation } from '../../../core/types';
import type { BackgroundTaskActivationIndicatorCoordinator } from '../services/BackgroundTaskActivationIndicatorCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../services/QuestionTodoActivationRefreshCoordinator';
import type { TabId } from '../tabs';
import type { TabConversationStateBridge } from './TabConversationStateBridge';
import type { TabViewActivationBridge } from './TabViewActivationBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'applyActiveConversation' | 'clearActiveConversation' | 'commitConversationSyncBaseline'
>;

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshCoordinator,
  'applyConversationActivation'
>;

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorCoordinator,
  | 'prepareOpenConversation'
  | 'syncOpenConversationState'
  | 'renderOpenConversationIndicator'
>;

type TabViewActivationPort = Pick<
  TabViewActivationBridge,
  'applyEmptyActivationOutcome' | 'applyStreamingActivationOutcome'
>;

export interface TabConversationActivationBridgeHost {
  getActiveTabId(): TabId | null;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export class TabConversationActivationBridge {
  constructor(
    private readonly host: TabConversationActivationBridgeHost,
    private readonly tabConversationStateBridge: TabConversationStatePort,
    private readonly tabViewActivationBridge: TabViewActivationPort,
    private readonly questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort,
    private readonly backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort,
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

  applyLoadedConversationActivation(tabId: TabId | null, conversation: Conversation): void {
    this.tabConversationStateBridge.applyActiveConversation(tabId, conversation, {
      clearRevertState: true,
      resetSessionState: true,
      resetBackgroundTaskSuppressedFingerprint: true,
    });
  }

  openConversation(conversation: Conversation): void {
    this.backgroundTaskActivationIndicatorCoordinator.prepareOpenConversation(conversation);

    const activeTabId = this.host.getActiveTabId();
    this.tabConversationStateBridge.applyActiveConversation(activeTabId, conversation, {
      clearRevertState: true,
      resetSessionState: true,
    });
    this.resetActivePaneShell();
    this.tabConversationStateBridge.commitConversationSyncBaseline(conversation.messages);
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.backgroundTaskActivationIndicatorCoordinator.syncOpenConversationState(
      conversation,
      activeTabId,
    );
    this.questionTodoActivationRefreshCoordinator.applyConversationActivation(
      activeTabId,
      conversation.openCodeSessionId,
    );
    this.backgroundTaskActivationIndicatorCoordinator.renderOpenConversationIndicator(activeTabId);
    void this.host.refreshActiveTabContextUsageFromServer();
    this.host.scheduleSettledScrollToBottom(activeTabId);
  }

  private resetActivePaneShell(): void {
    this.host.clearMessagesContainer();
    this.host.resetTurnState();
  }
}
