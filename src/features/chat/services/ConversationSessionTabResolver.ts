import type { Conversation } from '../../../core/types';
import type { TabData, TabId } from '../tabs';

export interface ConversationSessionTabResolverHost {
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
}

export class ConversationSessionTabResolver {
  constructor(private readonly host: ConversationSessionTabResolverHost) {}

  resolveMatchedTabIds(sessionId: string): TabId[] {
    const conversations = new Map(
      this.host.getConversations().map((conversation) => [conversation.id, conversation]),
    );
    const matchedTabIds = this.host.getAllTabs()
      .filter((tab) => {
        const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
        return conversation?.openCodeSessionId === sessionId;
      })
      .map((tab) => tab.id);

    const activeTabId = this.resolveActiveTabFallback(sessionId);
    if (matchedTabIds.length === 0 && activeTabId) {
      matchedTabIds.push(activeTabId);
    }

    return matchedTabIds;
  }

  private resolveActiveTabFallback(sessionId: string): TabId | null {
    if (this.host.getCurrentConversation()?.openCodeSessionId !== sessionId) {
      return null;
    }

    return this.host.getActiveTabId();
  }
}
