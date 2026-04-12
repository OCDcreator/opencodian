import type { ActiveTabContextUsageCoordinator } from '../services/ActiveTabContextUsageCoordinator';
import type { BackgroundTaskActivationIndicatorCoordinator } from '../services/BackgroundTaskActivationIndicatorCoordinator';
import type { FocusContextPreviewCoordinator } from '../services/FocusContextPreviewCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../services/QuestionTodoActivationRefreshCoordinator';
import type { TabId } from '../tabs';

type ActiveTabContextUsagePort = Pick<
  ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

type FocusContextPreviewRefreshPort = Pick<
  FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

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
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  constructor(
    private readonly host: TabViewActivationBridgeHost,
    private readonly focusContextPreviewCoordinator: FocusContextPreviewRefreshPort,
    private readonly questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort,
    private readonly backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort,
    private readonly activeTabContextUsageCoordinator: ActiveTabContextUsagePort,
  ) {}

  applyActivationPreflight(tabId: TabId): void {
    this.host.setActiveMessagesPane(tabId);
    this.focusContextPreviewCoordinator.refreshActiveFocusContextPreview();
    this.questionTodoActivationRefreshCoordinator.applyActivationPreflight(tabId);
  }

  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void {
    this.host.updateModelSelectorDisplay();
    this.activeTabContextUsageCoordinator.syncIdentity();
    this.questionTodoActivationRefreshCoordinator.applyConversationActivation(tabId, sessionId);
    this.host.updateSendButtonState();
  }

  applyEmptyActivationOutcome(tabId: TabId): void {
    this.questionTodoActivationRefreshCoordinator.applyEmptyActivation(tabId);
    this.host.updateModelSelectorDisplay();
    this.activeTabContextUsageCoordinator.syncIdentity();
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
    this.activeTabContextUsageCoordinator.syncIdentity();
    await this.activeTabContextUsageCoordinator.refreshFromServer();
  }
}
