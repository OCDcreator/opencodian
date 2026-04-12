import type { SessionSyncEventUpdate } from '../../../core/opencode';
import type { Conversation } from '../../../core/types';
import type { TabData, TabId } from '../tabs';

export interface ConversationSyncEventAdapterHost {
  subscribeToSessionSyncEvents(listener: (update: SessionSyncEventUpdate) => void): () => void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: SessionSyncEventUpdate['type']): void;
}

export class ConversationSyncEventAdapter {
  private disposeSubscription: (() => void) | null = null;

  constructor(private readonly host: ConversationSyncEventAdapterHost) {}

  start(): void {
    this.stop();
    this.disposeSubscription = this.host.subscribeToSessionSyncEvents((update) => {
      this.handleSessionSyncEvent(update);
    });
  }

  stop(): void {
    this.disposeSubscription?.();
    this.disposeSubscription = null;
  }

  private handleSessionSyncEvent(update: SessionSyncEventUpdate): void {
    for (const tabId of this.getMatchedTabIds(update.sessionId)) {
      this.host.scheduleConversationSyncFromSignal(tabId, update.type);
    }
  }

  private getMatchedTabIds(sessionId: string): TabId[] {
    const conversations = new Map(
      this.host.getConversations().map((conversation) => [conversation.id, conversation]),
    );
    const matchedTabIds = this.host.getAllTabs()
      .filter((tab) => {
        const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
        return conversation?.openCodeSessionId === sessionId;
      })
      .map((tab) => tab.id);

    const activeTabId = this.host.getActiveTabId();
    if (
      matchedTabIds.length === 0
      && this.host.getCurrentConversation()?.openCodeSessionId === sessionId
      && activeTabId
    ) {
      matchedTabIds.push(activeTabId);
    }

    return matchedTabIds;
  }
}
