import {
  type ChatMessage,
  type Conversation,
  type PersistedTabState,
} from '../../../core/types';
import type {
  ConversationLoadRuntimePort,
  ConversationLoadRuntimeOptions,
} from '../runtime/ConversationLoadRuntimeBridge';
import type { TabConversationActivationBridge } from '../runtime/TabConversationActivationBridge';
import type { TabViewActivationBridge } from '../runtime/TabViewActivationBridge';
import type { ConversationTransitionPort } from '../runtime/ConversationTransitionBridge';
import type { RestoredTabState, TabData, TabId } from '../tabs';

export interface LoadConversationOptions {
  forceServerSync?: boolean;
  preserveScrollPosition?: boolean;
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

  applyStreamingConversationActivation(tabId: TabId, conversation: Conversation): Promise<void> | void;

  applyLoadedConversationActivation(tabId: TabId | null, conversation: Conversation): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
  commitConversationSyncBaseline(messages: ChatMessage[]): void;
}

type TabConversationActivationPort = Pick<TabConversationActivationBridge, 'applyEmptyTabActivation'>;

type TabViewActivationPort =
  Pick<
    TabViewActivationBridge,
    'applyActivationPreflight' | 'applyLoadedConversationPostRenderOutcome' | 'applyLoadedConversationHydrationTail'
  >;

export class ConversationViewStateService {
  constructor(
    private readonly host: ConversationViewStateHost,
    private readonly tabConversationActivationBridge: TabConversationActivationPort,
    private readonly tabViewActivationBridge: TabViewActivationPort,
    private readonly conversationTransitionBridge: ConversationTransitionPort,
    private readonly conversationLoadRuntimeBridge: ConversationLoadRuntimePort,
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
        const conversation = await this.conversationLoadRuntimeBridge.resolveConversation(
          tab.conversationId,
        );
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

    this.tabConversationActivationBridge.applyEmptyTabActivation(tabId);
  }

  async loadConversation(
    id: string,
    options: LoadConversationOptions = {},
  ): Promise<void> {
    await this.conversationTransitionBridge.prepareLoadedConversationTransition(id);

    const conversation = await this.conversationLoadRuntimeBridge.resolveConversation(id, {
      reloadIfMissing: true,
    });
    if (!conversation) {
      return;
    }

    const transitionContext = this.conversationTransitionBridge.captureLoadedConversationTransition(
      Boolean(options.preserveScrollPosition),
    );
    const { activeTabId } = transitionContext;

    this.host.applyLoadedConversationActivation(activeTabId, conversation);
    this.conversationTransitionBridge.beginLoadedConversationTransition(transitionContext);

    try {
      const messages = await this.conversationLoadRuntimeBridge.loadConversationMessages(
        conversation,
        activeTabId,
        this.buildConversationLoadRuntimeOptions(options),
      );
      this.host.syncBackgroundTaskStateFromConversation(conversation);
      await this.host.renderMessages(messages);
      await this.tabViewActivationBridge.applyLoadedConversationPostRenderOutcome(
        activeTabId,
        conversation.openCodeSessionId,
      );
      this.host.commitConversationSyncBaseline(messages);
      this.conversationTransitionBridge.restoreLoadedConversationTransition(transitionContext);
      await this.tabViewActivationBridge.applyLoadedConversationHydrationTail();
    } finally {
      this.conversationTransitionBridge.endLoadedConversationTransition(transitionContext);
    }
  }

  private buildConversationLoadRuntimeOptions(
    options: LoadConversationOptions,
  ): ConversationLoadRuntimeOptions {
    return {
      forceServerSync: options.forceServerSync,
    };
  }
}
