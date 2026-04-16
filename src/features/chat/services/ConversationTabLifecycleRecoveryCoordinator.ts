import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { CloseTabResult, CloseTabsResult, TabData, TabId } from '../tabs';

interface ConversationTabLifecycleRecoveryTabManager {
  getTab(tabId: TabId): TabData | null;
  getActiveTab(): TabData | null;
  getAllTabs(): TabData[];
  getTabCount(): number;
  closeTab(tabId: TabId): CloseTabResult;
  closeTabs(tabIds: readonly TabId[]): CloseTabsResult;
  createTab(conversation?: Pick<Conversation, 'id' | 'title'> | null): TabData | null;
}

export interface ConversationTabLifecycleRecoveryHost {
  getTabManager(): ConversationTabLifecycleRecoveryTabManager | null;
  isTabForegroundBusy(tabId: TabId): boolean;
  getCurrentConversationId(): string | null;
  createConversation(): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  clearTabMessagesPanes(): void;
  resetTabManager(): void;
  removeTabMessagesPane(tabId: TabId): void;
  showNotice(message: string): void;
}

export interface ConversationTabLifecycleRecoveryPort {
  activateTab(tabId: TabId): Promise<void>;
  createConversationInNewTab(): Promise<void>;
}

export class ConversationTabLifecycleRecoveryCoordinator {
  constructor(
    private readonly host: ConversationTabLifecycleRecoveryHost,
    private readonly port: ConversationTabLifecycleRecoveryPort,
  ) {}

  async closeTabAndRecover(tabId: TabId): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    const tab = tabManager.getTab(tabId);
    if (!tab) {
      return;
    }

    if (this.host.isTabForegroundBusy(tabId)) {
      this.host.showNotice(t('chat.tab.streamingBlocked'));
      return;
    }

    const result = tabManager.closeTab(tabId);
    if (!result.closed) {
      return;
    }

    this.host.removeTabMessagesPane(tabId);

    if (result.nextActiveTabId) {
      await this.port.activateTab(result.nextActiveTabId);
      return;
    }

    await this.createSilentFallbackTab(tabManager);
  }

  async deleteConversationsAndRecover(conversationIds: readonly string[]): Promise<void> {
    const uniqueConversationIds = Array.from(new Set(conversationIds));
    if (uniqueConversationIds.length === 0) {
      return;
    }

    const conversationIdSet = new Set(uniqueConversationIds);
    for (const conversationId of uniqueConversationIds) {
      await this.host.deleteConversation(conversationId);
    }

    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      if (this.shouldRecoverCurrentConversation(conversationIdSet)) {
        await this.port.createConversationInNewTab();
      }
      return;
    }

    const tabsToClose = tabManager.getAllTabs()
      .filter((tab) => tab.conversationId && conversationIdSet.has(tab.conversationId));
    const activeTabId = tabManager.getActiveTab()?.id ?? null;
    const activeTabWillBeClosed = activeTabId
      ? tabsToClose.some((tab) => tab.id === activeTabId)
      : false;
    const closeResult = tabManager.closeTabs(tabsToClose.map((tab) => tab.id));

    for (const closedTabId of closeResult.closedTabIds) {
      this.host.removeTabMessagesPane(closedTabId);
    }

    if (tabManager.getTabCount() === 0) {
      await this.port.createConversationInNewTab();
      return;
    }

    if (activeTabWillBeClosed && closeResult.nextActiveTabId) {
      await this.port.activateTab(closeResult.nextActiveTabId);
    }
  }

  async deleteAllConversationsAndReset(conversationIds: readonly string[]): Promise<void> {
    const uniqueConversationIds = Array.from(new Set(conversationIds));
    if (uniqueConversationIds.length === 0) {
      return;
    }

    for (const conversationId of uniqueConversationIds) {
      await this.host.deleteConversation(conversationId);
    }

    this.host.clearTabMessagesPanes();
    this.host.resetTabManager();
    await this.port.createConversationInNewTab();
  }

  private shouldRecoverCurrentConversation(conversationIdSet: ReadonlySet<string>): boolean {
    const currentConversationId = this.host.getCurrentConversationId();
    return Boolean(currentConversationId && conversationIdSet.has(currentConversationId));
  }

  private async createSilentFallbackTab(
    tabManager: ConversationTabLifecycleRecoveryTabManager,
  ): Promise<void> {
    const conversation = await this.host.createConversation();
    const nextTab = tabManager.createTab(conversation);
    if (nextTab) {
      await this.port.activateTab(nextTab.id);
    }
  }
}
