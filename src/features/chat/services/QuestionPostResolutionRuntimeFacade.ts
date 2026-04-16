import type { TabId } from '../tabs';

export interface QuestionPostResolutionRuntimeState {
  isStreaming: boolean;
}

export interface QuestionPostResolutionRuntimeFacadeHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionPostResolutionRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export class QuestionPostResolutionRuntimeFacade {
  constructor(private readonly host: QuestionPostResolutionRuntimeFacadeHost) {}

  async followUpAfterResolution(tabId: TabId | null): Promise<void> {
    const sessionId = this.host.getSessionIdForTab(tabId) ?? undefined;
    if (!sessionId) {
      return;
    }

    void this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
    this.host.startConversationSyncLoop();

    if (!this.shouldSyncVisibleConversation(tabId)) {
      return;
    }

    await this.host.syncVisibleConversationInBackground();
  }

  private shouldSyncVisibleConversation(tabId: TabId | null): boolean {
    return tabId === this.host.getActiveTabId()
      && !this.host.getTabRuntimeState(tabId)?.isStreaming;
  }
}
