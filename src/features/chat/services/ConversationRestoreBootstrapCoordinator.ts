import {
  type Conversation,
  type PersistedTabState,
} from '../../../core/types';
import type { RestoredTabState, TabData, TabId } from '../tabs';

interface ConversationRestoreBootstrapTabManager {
  createTab(conversation?: Pick<Conversation, 'id' | 'title'> | null): TabData | null;
  restoreTabs(
    items: RestoredTabState[],
    activeTabIndex: number,
    conversations: ReadonlyMap<string, Pick<Conversation, 'id' | 'title'>>,
  ): TabData | null;
}

export interface ConversationRestoreBootstrapHost {
  getTabManager(): ConversationRestoreBootstrapTabManager | null;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;

  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
}

export interface ConversationRestoreBootstrapActivationPort {
  activateTab(tabId: TabId): Promise<void>;
}

export class ConversationRestoreBootstrapCoordinator {
  constructor(
    private readonly host: ConversationRestoreBootstrapHost,
    private readonly activationPort: ConversationRestoreBootstrapActivationPort,
  ) {}

  async initializeFirstTab(): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    await this.host.loadConversations();

    const restoredTabId = this.restorePersistedTabs();
    if (restoredTabId) {
      await this.activationPort.activateTab(restoredTabId);
      return;
    }

    let initialConversation = this.host.getConversations()[0];
    if (!initialConversation) {
      initialConversation = await this.host.createConversation();
    }

    const tab = tabManager.createTab(initialConversation);
    if (tab) {
      await this.activationPort.activateTab(tab.id);
    }
  }

  restorePersistedTabs(): TabId | null {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return null;
    }

    const savedState = this.host.getPersistedTabState();
    if (!savedState.tabs.length) {
      return null;
    }

    const conversationMap = new Map(
      this.host.getConversations().map((conversation) => [conversation.id, conversation] as const),
    );
    const restoredTab = tabManager.restoreTabs(
      savedState.tabs as RestoredTabState[],
      savedState.activeTabIndex,
      conversationMap,
    );

    if (!restoredTab) {
      this.host.resetPersistedTabState();
      this.host.persistTabState({ flush: true });
      return null;
    }

    return restoredTab.id;
  }
}
