import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { CloseTabResult, CloseTabsResult, TabData, TabId } from '../tabs';

const logger = createLogger('ConversationTabLifecycleRecoveryCoordinator');

interface ConversationTabLifecycleRecoveryTabManager {
  areTabsEnabled?(): boolean;
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
  cancelOpenCodeDiagnosticCapture?(tabId: TabId): void;
  cancelCodexDiagnosticCapture?(tabId: TabId): void;
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

  /**
   * Runs a diagnostic-capture cancel inside a safe boundary so a throwing
   * trace service cannot interrupt tab recovery / deletion. The cancel is
   * best-effort; a throw is logged and swallowed.
   */
  private safeTraceCancel(run: () => void): void {
    try {
      run();
    } catch {
      logger.warn('trace cancel hook threw; continuing tab recovery without trace data');
    }
  }

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

    this.safeTraceCancel(() => this.host.cancelOpenCodeDiagnosticCapture?.(tabId));
    this.safeTraceCancel(() => this.host.cancelCodexDiagnosticCapture?.(tabId));
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
      this.safeTraceCancel(() => this.host.cancelOpenCodeDiagnosticCapture?.(closedTabId));
      this.safeTraceCancel(() => this.host.cancelCodexDiagnosticCapture?.(closedTabId));
      this.host.removeTabMessagesPane(closedTabId);
    }

    if (tabManager.getTabCount() === 0) {
      if (!this.areTabsEnabled(tabManager)) {
        await this.createSilentFallbackTab(tabManager);
        return;
      }
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

    // Reset drops every tab in one step, so it has no close-result loop in
    // which to cancel capture claims. Snapshot ids first and cancel each
    // best-effort before the manager is cleared.
    const tabIds = this.host.getTabManager()?.getAllTabs().map((tab) => tab.id) ?? [];
    for (const tabId of tabIds) {
      this.safeTraceCancel(() => this.host.cancelOpenCodeDiagnosticCapture?.(tabId));
      this.safeTraceCancel(() => this.host.cancelCodexDiagnosticCapture?.(tabId));
    }
    this.host.clearTabMessagesPanes();
    this.host.resetTabManager();
    const tabManager = this.host.getTabManager();
    if (tabManager && !this.areTabsEnabled(tabManager)) {
      await this.createSilentFallbackTab(tabManager);
      return;
    }
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

  private areTabsEnabled(tabManager: ConversationTabLifecycleRecoveryTabManager): boolean {
    return tabManager.areTabsEnabled?.() ?? true;
  }
}
