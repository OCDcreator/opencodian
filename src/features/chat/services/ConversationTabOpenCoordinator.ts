import type { ToolCallInfo } from '../../../core/types';
import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabData, TabId } from '../tabs';

interface ConversationTabOpenTabManager {
  areTabsEnabled?(): boolean;
  canCreateTab(): boolean;
  createTab(
    conversation?: Pick<Conversation, 'id' | 'title'> | null,
    options?: { ignoreMaxTabs?: boolean; parentTabId?: TabId | null },
  ): TabData | null;
  getActiveTab(): TabData | null;
}

export interface ConversationTabOpenHost {
  getTabManager(): ConversationTabOpenTabManager | null;
  getMaxTabs(): number;
  isActiveTabStreaming(): boolean;
  createConversation(): Promise<Conversation>;
  createConversationFromSession(
    sessionId: string,
    initial?: Pick<Conversation, 'title'>,
  ): Promise<Conversation>;
  deleteConversation(conversationId: string): Promise<void>;
  showNotice(message: string): void;
}

export interface ConversationTabOpenPort {
  activateTab(tabId: TabId): Promise<void>;
  openConversationInCurrentTab(conversation: Conversation): void;
  syncActiveTabConversation(conversation: Conversation): void;
  loadConversation(id: string, options?: { forceServerSync?: boolean }): Promise<void>;
}

export class ConversationTabOpenCoordinator {
  constructor(
    private readonly host: ConversationTabOpenHost,
    private readonly port: ConversationTabOpenPort,
  ) {}

  async createConversationInNewTab(): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!this.areTabsEnabled(tabManager)) {
      await this.createConversationInCurrentTab();
      return;
    }

    if (!tabManager) {
      return;
    }

    if (!tabManager.canCreateTab()) {
      this.host.showNotice(t('chat.tab.maxReached', {
        count: String(this.host.getMaxTabs()),
      }));
      return;
    }

    try {
      const conversation = await this.host.createConversation();
      const tab = tabManager.createTab(conversation);
      if (tab) {
        await this.port.activateTab(tab.id);
      }
      this.host.showNotice(t('chat.tab.created'));
    } catch (error) {
      this.host.showNotice(this.getErrorMessage(error));
    }
  }

  async createConversationInCurrentTab(): Promise<void> {
    if (!this.host.getTabManager()) {
      return;
    }

    if (this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.tab.newBlockedWhileStreaming'));
      return;
    }

    try {
      const conversation = await this.host.createConversation();
      this.port.openConversationInCurrentTab(conversation);
      this.host.showNotice(t('chat.tab.newCurrentCreated'));
    } catch (error) {
      this.host.showNotice(this.getErrorMessage(error));
    }
  }

  buildTaskToolSessionTitle(
    sessionId: string,
    toolCall?: Pick<ToolCallInfo, 'input'> | null,
  ): string {
    const description = typeof toolCall?.input?.description === 'string'
      ? toolCall.input.description.trim()
      : '';
    const subagentType = typeof toolCall?.input?.subagent_type === 'string'
      ? toolCall.input.subagent_type.trim()
      : '';
    return `Subagent: ${description || subagentType || sessionId}`;
  }

  async openTaskToolSession(
    sessionId: string,
    toolCall?: Pick<ToolCallInfo, 'input'> | null,
  ): Promise<void> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    const tabManager = this.host.getTabManager();
    // With no internal tab runtime, replacing the current session would discard
    // the only visible stream. Normal tab-backed child sessions run in parallel.
    if (!tabManager && this.host.isActiveTabStreaming()) {
      this.host.showNotice(t('chat.tab.newBlockedWhileStreaming'));
      return;
    }

    try {
      const conversation = await this.host.createConversationFromSession(normalizedSessionId, {
        title: this.buildTaskToolSessionTitle(normalizedSessionId, toolCall),
      });

      if (tabManager) {
        const parentTab = tabManager.getActiveTab();
        const tab = tabManager.createTab(conversation, {
          ignoreMaxTabs: true,
          parentTabId: parentTab?.id ?? null,
        });
        if (tab) {
          await this.port.activateTab(tab.id);
          return;
        }
        await this.host.deleteConversation(conversation.id);
        this.host.showNotice(t('chat.tab.childOpenFailed'));
        return;
      }

      this.port.syncActiveTabConversation(conversation);
      await this.port.loadConversation(conversation.id, { forceServerSync: true });
    } catch {
      this.host.showNotice(t('chat.tab.childOpenFailed'));
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Failed to create conversation';
  }

  private areTabsEnabled(tabManager: ConversationTabOpenTabManager | null): boolean {
    return tabManager?.areTabsEnabled?.() ?? true;
  }
}
