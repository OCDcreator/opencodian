import type { BackgroundTaskActivationIndicatorCoordinator } from '../services/BackgroundTaskActivationIndicatorCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../services/QuestionTodoActivationRefreshCoordinator';
import type { TabId } from '../tabs';

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorCoordinator,
  'renderLoadedConversationIndicator'
>;

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshCoordinator,
  'applyActivationPreflight' | 'applyConversationActivation' | 'applyEmptyActivation'
>;

export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  constructor(
    private readonly host: TabViewActivationBridgeHost,
    private readonly questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort,
    private readonly backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort,
  ) {}

  applyActivationPreflight(tabId: TabId): void {
    this.host.setActiveMessagesPane(tabId);
    this.host.refreshActiveFocusContextPreview();
    this.questionTodoActivationRefreshCoordinator.applyActivationPreflight(tabId);
  }

  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void {
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.questionTodoActivationRefreshCoordinator.applyConversationActivation(tabId, sessionId);
    this.host.updateSendButtonState();
  }

  applyEmptyActivationOutcome(tabId: TabId): void {
    this.questionTodoActivationRefreshCoordinator.applyEmptyActivation(tabId);
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.host.updateSendButtonState();
  }

  async applyLoadedConversationPostRenderOutcome(
    tabId: TabId | null,
    sessionId: string | null,
  ): Promise<void> {
    await this.backgroundTaskActivationIndicatorCoordinator.renderLoadedConversationIndicator(tabId);
    this.questionTodoActivationRefreshCoordinator.applyConversationActivation(tabId, sessionId);
  }

  async applyLoadedConversationHydrationTail(): Promise<void> {
    this.host.scheduleComposerLayoutSync();
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    await this.host.refreshActiveTabContextUsageFromServer();
  }
}
