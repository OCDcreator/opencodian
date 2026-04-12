import type { QuestionTodoStatusRefreshCoordinator } from '../services/QuestionTodoStatusRefreshCoordinator';
import type { TabId } from '../tabs';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  constructor(
    private readonly host: TabViewActivationBridgeHost,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
  ) {}

  applyActivationPreflight(tabId: TabId): void {
    this.host.setActiveMessagesPane(tabId);
    this.host.refreshActiveFocusContextPreview();
    this.host.renderQuestionDock();
    this.host.updateSessionTodoDockForTab(tabId);
  }

  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void {
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
    void this.questionTodoStatusRefreshCoordinator.refreshAfterActivation(tabId, sessionId);
    this.host.updateSendButtonState();
  }

  applyEmptyActivationOutcome(tabId: TabId): void {
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.host.updateSendButtonState();
  }

  async applyLoadedConversationPostRenderOutcome(
    tabId: TabId | null,
    sessionId: string | null,
  ): Promise<void> {
    await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
    void this.questionTodoStatusRefreshCoordinator.refreshAfterActivation(tabId, sessionId);
  }

  async applyLoadedConversationHydrationTail(): Promise<void> {
    this.host.scheduleComposerLayoutSync();
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    await this.host.refreshActiveTabContextUsageFromServer();
  }
}
