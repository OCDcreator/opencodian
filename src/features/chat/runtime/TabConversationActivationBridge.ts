import type { Conversation } from '../../../core/types';
import type { ActiveTabContextUsageCoordinator } from '../services/ActiveTabContextUsageCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../services/QuestionTodoActivationRefreshCoordinator';
import type { BackgroundTaskActivationIndicatorPort as BackgroundTaskActivationIndicatorSourcePort } from '../services/QuestionTodoBackgroundTaskActivationHostAdapter';
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

type ActiveTabContextUsagePort = Pick<
  ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorSourcePort,
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
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

interface TabConversationActivationBridgeDependencies {
  host: TabConversationActivationBridgeHost;
  tabConversationStateBridge: TabConversationStatePort;
  tabViewActivationBridge: TabViewActivationPort;
  questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort;
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort;
  activeTabContextUsageCoordinator: ActiveTabContextUsagePort;
}

export class TabConversationActivationBridge {
  private readonly host: TabConversationActivationBridgeHost;
  private readonly tabConversationStateBridge: TabConversationStatePort;
  private readonly tabViewActivationBridge: TabViewActivationPort;
  private readonly questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort;
  private readonly backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort;
  private readonly activeTabContextUsageCoordinator: ActiveTabContextUsagePort;

  constructor({
    host,
    tabConversationStateBridge,
    tabViewActivationBridge,
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
    activeTabContextUsageCoordinator,
  }: TabConversationActivationBridgeDependencies) {
    this.host = host;
    this.tabConversationStateBridge = tabConversationStateBridge;
    this.tabViewActivationBridge = tabViewActivationBridge;
    this.questionTodoActivationRefreshCoordinator = questionTodoActivationRefreshCoordinator;
    this.backgroundTaskActivationIndicatorCoordinator =
      backgroundTaskActivationIndicatorCoordinator;
    this.activeTabContextUsageCoordinator = activeTabContextUsageCoordinator;
  }

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
    this.activeTabContextUsageCoordinator.syncIdentity();
    this.backgroundTaskActivationIndicatorCoordinator.syncOpenConversationState(
      conversation,
      activeTabId,
    );
    this.questionTodoActivationRefreshCoordinator.applyConversationActivation(
      activeTabId,
      conversation.openCodeSessionId,
    );
    this.backgroundTaskActivationIndicatorCoordinator.renderOpenConversationIndicator(activeTabId);
    void this.activeTabContextUsageCoordinator.refreshFromServer();
    this.host.scheduleSettledScrollToBottom(activeTabId);
  }

  private resetActivePaneShell(): void {
    this.host.clearMessagesContainer();
    this.host.resetTurnState();
  }
}
