import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
} from '../../../shared';
import type { ActiveTabContextUsageCoordinator } from '../services/ActiveTabContextUsageCoordinator';
import type { FocusContextPreviewCoordinator } from '../services/FocusContextPreviewCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../services/QuestionTodoActivationRefreshCoordinator';
import type { BackgroundTaskActivationIndicatorPort as BackgroundTaskActivationIndicatorSourcePort } from '../services/QuestionTodoBackgroundTaskActivationHostAdapter';
import type { TabId } from '../tabs';

const logger = createLogger('TabViewActivationBridge');

type ActiveTabContextUsagePort = Pick<
  ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

type FocusContextPreviewRefreshPort = Pick<
  FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorSourcePort,
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

interface TabViewActivationBridgeDependencies {
  host: TabViewActivationBridgeHost;
  focusContextPreviewCoordinator: FocusContextPreviewRefreshPort;
  questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort;
  backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort;
  activeTabContextUsageCoordinator: ActiveTabContextUsagePort;
}

export class TabViewActivationBridge {
  private readonly host: TabViewActivationBridgeHost;
  private readonly focusContextPreviewCoordinator: FocusContextPreviewRefreshPort;
  private readonly questionTodoActivationRefreshCoordinator: QuestionTodoActivationRefreshPort;
  private readonly backgroundTaskActivationIndicatorCoordinator: BackgroundTaskActivationIndicatorPort;
  private readonly activeTabContextUsageCoordinator: ActiveTabContextUsagePort;

  constructor({
    host,
    focusContextPreviewCoordinator,
    questionTodoActivationRefreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator,
    activeTabContextUsageCoordinator,
  }: TabViewActivationBridgeDependencies) {
    this.host = host;
    this.focusContextPreviewCoordinator = focusContextPreviewCoordinator;
    this.questionTodoActivationRefreshCoordinator = questionTodoActivationRefreshCoordinator;
    this.backgroundTaskActivationIndicatorCoordinator =
      backgroundTaskActivationIndicatorCoordinator;
    this.activeTabContextUsageCoordinator = activeTabContextUsageCoordinator;
  }

  applyActivationPreflight(tabId: TabId): void {
    this.host.setActiveMessagesPane(tabId);
    this.focusContextPreviewCoordinator.refreshActiveFocusContextPreview();
    this.questionTodoActivationRefreshCoordinator.applyActivationPreflight(tabId);
  }

  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void {
    this.host.updateModelSelectorDisplay();
    this.activeTabContextUsageCoordinator.syncIdentity();
    if (sessionId) {
      this.questionTodoActivationRefreshCoordinator.applyConversationActivation(tabId, sessionId);
    }
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
    if (sessionId) {
      this.questionTodoActivationRefreshCoordinator.applyConversationActivation(tabId, sessionId);
    }
  }

  applyLoadedConversationHydrationTail(): void {
    this.host.scheduleComposerLayoutSync();
    this.host.updateModelSelectorDisplay();
    this.activeTabContextUsageCoordinator.syncIdentity();
    this.refreshContextUsageFromServerInBackground();
  }

  private refreshContextUsageFromServerInBackground(): void {
    const startedAt = getPerformanceTimestampMs();
    void this.activeTabContextUsageCoordinator.refreshFromServer()
      .then(() => {
        logger.debug(
          `[hydration-tail] context usage background refresh completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
        );
      })
      .catch((error) => {
        logger.warn(
          `[hydration-tail] context usage background refresh failed after ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
          error,
        );
      });
  }
}
