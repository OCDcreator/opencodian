import type { SessionActivityStatus } from '../../../core/opencode';
import {
  type ChatMessage,
  type Conversation,
  type PersistedTabState,
  type QuestionRequest,
  type SessionTodo,
} from '../../../core/types';
import type { RestoredTabState, TabData, TabId } from '../tabs';
import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
  type ScrollRuntimeState,
} from './ScrollManager';

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

  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  applyStreamingConversationActivation(tabId: TabId, conversation: Conversation): Promise<void> | void;
  applyEmptyTabActivation(tabId: TabId): void;

  prepareConversationTransition(nextConversationId: string): Promise<void>;
  applyLoadedConversationActivation(tabId: TabId | null, conversation: Conversation): void;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
  getMessagesContainer(): HTMLElement | null;
  getActiveTabId(): TabId | null;
  getScrollRuntimeForTab(tabId: TabId | null): ScrollRuntimeState | null;
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
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  renderSessionTodoDock(tabId?: TabId | null): void;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
    options: { suppressErrors?: boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshPendingQuestionsForTab(tabId: TabId | null, sessionId: string | null): Promise<QuestionRequest[]>;
  refreshActiveSessionTodos(options: { suppressErrors?: boolean }): Promise<SessionTodo[]>;
  commitConversationSyncBaseline(messages: ChatMessage[]): void;
  scrollToBottom(options: { tabId: TabId | null }): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl: HTMLElement): void;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  endConversationHydration(tabId: TabId | null): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
}

export class ConversationViewStateService {
  constructor(private readonly host: ConversationViewStateHost) {}

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

    this.host.setActiveMessagesPane(tabId);
    this.host.refreshActiveFocusContextPreview();
    this.host.renderQuestionDock();
    this.host.updateSessionTodoDockForTab(tabId);

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

    const messagesEl = this.host.getMessagesContainer();
    const preserveScrollPosition = Boolean(options.preserveScrollPosition && messagesEl);
    const previousScrollTop = preserveScrollPosition && messagesEl
      ? messagesEl.scrollTop
      : 0;
    const activeTabId = this.host.getActiveTabId();
    const runtime = this.host.getScrollRuntimeForTab(activeTabId);
    const shouldStickToBottom = preserveScrollPosition && messagesEl
      ? runtime?.autoScrollEnabled ?? isElementNearBottom(messagesEl)
      : true;

    this.host.applyLoadedConversationActivation(activeTabId, conversation);
    this.host.clearScheduledScrollToBottom();
    this.host.beginConversationHydration(activeTabId);
    messagesEl?.classList.add('is-rehydrating');
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
      await this.host.renderBackgroundTaskIndicatorIfNeeded(activeTabId);
      this.host.renderSessionTodoDock(activeTabId);
      this.host.renderQuestionDock();
      void this.host.refreshTabSessionStatus(activeTabId, conversation.openCodeSessionId, { suppressErrors: true });
      void this.host.refreshPendingQuestionsForTab(activeTabId, conversation.openCodeSessionId);
      void this.host.refreshActiveSessionTodos({ suppressErrors: true });
      this.host.commitConversationSyncBaseline(messages);

      if (messagesEl) {
        if (runtime) {
          runtime.autoScrollEnabled = shouldStickToBottom;
        }
        const scrollSnapshot = captureElementScrollRestoreSnapshot(
          messagesEl,
          !preserveScrollPosition || shouldStickToBottom,
          previousScrollTop,
        );
        restoreElementScrollAfterRender(messagesEl, scrollSnapshot, {
          runtime,
          onRestoreBottom: () => {
            this.host.scrollToBottom({ tabId: activeTabId });
          },
          onRestored: () => {
            this.host.syncPaneScrollMetrics(activeTabId, messagesEl);
          },
          requestAnimationFrame: (callback) => this.host.requestAnimationFrame(callback),
        });
        this.host.requestAnimationFrame(() => {
          messagesEl.classList.remove('is-rehydrating');
        });
      }

      this.host.scheduleComposerLayoutSync();
      this.host.updateModelSelectorDisplay();
      this.host.syncActiveTabContextUsageIdentity();
      await this.host.refreshActiveTabContextUsageFromServer();
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
