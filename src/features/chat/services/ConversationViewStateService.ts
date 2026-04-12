import {
  type ChatMessage,
  type Conversation,
  type PersistedTabState,
} from '../../../core/types';
import type { ConversationHydrationRenderPort } from '../runtime/ConversationHydrationRenderBridge';
import type { TabViewActivationBridge } from '../runtime/TabViewActivationBridge';
import type { RestoredTabState, TabData, TabId } from '../tabs';

export interface LoadConversationOptions {
  forceServerSync?: boolean;
  preserveScrollPosition?: boolean;
}

interface ConversationSyncResult {
  messages: ChatMessage[];
  revertState: { messageID: string; partID?: string } | null;
}

interface ConversationViewStateTabManager {
  createTab(conversation?: Pick<Conversation, 'id' | 'title'> | null): TabData | null;
  getTab(tabId: TabId): TabData | null;
  restoreTabs(
    items: RestoredTabState[],
    activeTabIndex: number,
    conversations: ReadonlyMap<string, Pick<Conversation, 'id' | 'title'>>,
  ): TabData | null;
}

export interface ConversationViewStateHost {
  getTabManager(): ConversationViewStateTabManager | null;
  getPersistedTabState(): PersistedTabState;
  resetPersistedTabState(): void;
  persistTabState(options?: { flush?: boolean }): void;

  loadConversations(): Promise<void>;
  getConversations(): Conversation[];
  createConversation(): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | null>;

  applyStreamingConversationActivation(tabId: TabId, conversation: Conversation): Promise<void> | void;
  applyEmptyTabActivation(tabId: TabId): void;

  prepareConversationTransition(nextConversationId: string): Promise<void>;
  applyLoadedConversationActivation(tabId: TabId | null, conversation: Conversation): void;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
  clearScheduledScrollToBottom(): void;
  beginConversationHydration(tabId: TabId | null): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  shouldSyncConversationFromServer(conversation: Conversation, options: LoadConversationOptions): boolean;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<ConversationSyncResult>;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  commitConversationSyncBaseline(messages: ChatMessage[]): void;
  endConversationHydration(tabId: TabId | null): void;
}

type TabViewActivationPort =
  Pick<
    TabViewActivationBridge,
    'applyActivationPreflight' | 'applyLoadedConversationPostRenderOutcome' | 'applyLoadedConversationHydrationTail'
  >;

export class ConversationViewStateService {
  constructor(
    private readonly host: ConversationViewStateHost,
    private readonly tabViewActivationBridge: TabViewActivationPort,
    private readonly conversationHydrationRenderBridge: ConversationHydrationRenderPort,
  ) {}

  async initializeFirstTab(): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    await this.host.loadConversations();

    const restoredTabId = this.restorePersistedTabs();
    if (restoredTabId) {
      await this.activateTab(restoredTabId);
      return;
    }

    let initialConversation = this.host.getConversations()[0];
    if (!initialConversation) {
      initialConversation = await this.host.createConversation();
    }

    const tab = tabManager.createTab(initialConversation);
    if (tab) {
      await this.activateTab(tab.id);
    }
  }

  restorePersistedTabs(): string | null {
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

  async activateTab(tabId: string): Promise<void> {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    const tab = tabManager.getTab(tabId);
    if (!tab) {
      return;
    }

    this.tabViewActivationBridge.applyActivationPreflight(tabId);

    if (tab.conversationId) {
      if (tab.isStreaming) {
        const conversation = await this.host.getConversationById(tab.conversationId);
        if (!conversation) {
          return;
        }

        await this.host.applyStreamingConversationActivation(tabId, conversation);
        return;
      }

      await this.loadConversation(tab.conversationId, {
        preserveScrollPosition: true,
      });
      return;
    }

    this.host.applyEmptyTabActivation(tabId);
  }

  async loadConversation(
    id: string,
    options: LoadConversationOptions = {},
  ): Promise<void> {
    await this.host.prepareConversationTransition(id);

    const conversation = await this.resolveConversation(id);
    if (!conversation) {
      return;
    }

    const hydrationContext = this.conversationHydrationRenderBridge.captureHydrationContext(
      Boolean(options.preserveScrollPosition),
    );
    const { activeTabId } = hydrationContext;

    this.host.applyLoadedConversationActivation(activeTabId, conversation);
    this.host.clearScheduledScrollToBottom();
    this.host.beginConversationHydration(activeTabId);
    this.conversationHydrationRenderBridge.beginHydrationShell(hydrationContext);
    this.host.clearMessagesContainer();
    this.host.resetTurnState();

    const shouldSyncFromServer = this.host.shouldSyncConversationFromServer(conversation, options);

    try {
      let messages = conversation.messages;
      if (shouldSyncFromServer) {
        const syncResult = await this.host.syncConversationMessagesFromServer(
          conversation,
          activeTabId,
          'load-conversation',
        );
        messages = syncResult.messages;
        this.host.setCurrentConversationRevertState(syncResult.revertState);
      }

      this.host.syncBackgroundTaskStateFromConversation(conversation);
      await this.host.renderMessages(messages);
      await this.tabViewActivationBridge.applyLoadedConversationPostRenderOutcome(
        activeTabId,
        conversation.openCodeSessionId,
      );
      this.host.commitConversationSyncBaseline(messages);
      this.conversationHydrationRenderBridge.restoreHydrationShell(hydrationContext);
      await this.tabViewActivationBridge.applyLoadedConversationHydrationTail();
    } finally {
      this.host.endConversationHydration(activeTabId);
    }
  }

  private async resolveConversation(id: string): Promise<Conversation | null> {
    let conversation = await this.host.getConversationById(id);
    if (!conversation) {
      await this.host.loadConversations();
      conversation = await this.host.getConversationById(id);
    }

    return conversation;
  }
}
