import type { Conversation } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabData, TabId } from '../tabs';

interface ConversationTabOpenTabManager {
  canCreateTab(): boolean;
  createTab(conversation?: Pick<Conversation, 'id' | 'title'> | null): TabData | null;
}

export interface ConversationTabOpenHost {
  getTabManager(): ConversationTabOpenTabManager | null;
  getMaxTabs(): number;
  isActiveTabStreaming(): boolean;
  createConversation(): Promise<Conversation>;
  showNotice(message: string): void;
}

export interface ConversationTabOpenPort {
  activateTab(tabId: TabId): Promise<void>;
  openConversationInCurrentTab(conversation: Conversation): void;
}

export class ConversationTabOpenCoordinator {
  constructor(
    private readonly host: ConversationTabOpenHost,
    private readonly port: ConversationTabOpenPort,
  ) {}

  async createConversationInNewTab(): Promise<void> {
    const tabManager = this.host.getTabManager();
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Failed to create conversation';
  }
}
