import type { SessionActivityStatus } from '../../../core/opencode';
import type { QuestionRequest, SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';

export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  refreshTabSessionStatus(
    tabId: TabId,
    sessionId: string | null,
    options: { suppressErrors?: boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshPendingQuestionsForTab(tabId: TabId, sessionId: string | null): Promise<QuestionRequest[]>;
  refreshTabSessionTodos(
    tabId: TabId,
    sessionId: string | null,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  constructor(private readonly host: TabViewActivationBridgeHost) {}

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
    void this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
    void this.host.refreshPendingQuestionsForTab(tabId, sessionId);
    void this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true });
    this.host.updateSendButtonState();
  }

  applyEmptyActivationOutcome(tabId: TabId): void {
    this.host.renderSessionTodoDock(tabId);
    this.host.renderQuestionDock();
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    this.host.updateSendButtonState();
  }

  async applyLoadedConversationHydrationTail(): Promise<void> {
    this.host.scheduleComposerLayoutSync();
    this.host.updateModelSelectorDisplay();
    this.host.syncActiveTabContextUsageIdentity();
    await this.host.refreshActiveTabContextUsageFromServer();
  }
}
