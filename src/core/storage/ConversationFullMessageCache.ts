import type { Conversation } from '../types';

export interface ConversationFullMessageCacheOptions {
  readonly maxFullConversations: number;
}

export interface ConversationFullMessageCacheSnapshot {
  readonly fullConversationIds: string[];
  readonly pinnedConversationIds: string[];
  readonly evictedConversationIds: string[];
}

export function cloneConversationMetadataOnly(conversation: Conversation): Conversation {
  return {
    ...conversation,
    messages: [],
  };
}

function hasFullMessages(conversation: Conversation): boolean {
  return conversation.messages.length > 0;
}

export class ConversationFullMessageCache {
  private readonly lastAccessedAtByConversationId = new Map<string, number>();
  private readonly evictedConversationIds = new Set<string>();

  constructor(private readonly options: ConversationFullMessageCacheOptions) {}

  touch(conversationId: string, now = Date.now()): void {
    this.lastAccessedAtByConversationId.set(conversationId, now);
    this.evictedConversationIds.delete(conversationId);
  }

  forget(conversationId: string): void {
    this.lastAccessedAtByConversationId.delete(conversationId);
    this.evictedConversationIds.delete(conversationId);
  }

  getTrackedConversationIds(): string[] {
    return [...this.lastAccessedAtByConversationId.keys()];
  }

  isEvicted(conversationId: string): boolean {
    return this.evictedConversationIds.has(conversationId);
  }

  trim(
    conversations: Conversation[],
    pinnedConversationIds: ReadonlySet<string>,
  ): ConversationFullMessageCacheSnapshot {
    const fullConversationIds = conversations
      .filter(hasFullMessages)
      .map((conversation) => conversation.id);
    const evictable = conversations
      .filter((conversation) => hasFullMessages(conversation))
      .filter((conversation) => !pinnedConversationIds.has(conversation.id))
      .sort((left, right) => {
        const leftTouched = this.lastAccessedAtByConversationId.get(left.id) ?? left.updatedAt;
        const rightTouched = this.lastAccessedAtByConversationId.get(right.id) ?? right.updatedAt;
        return leftTouched - rightTouched;
      });

    const maxUnpinnedFullConversations = Math.max(0, this.options.maxFullConversations);
    const pinnedFullCount = fullConversationIds
      .filter((conversationId) => pinnedConversationIds.has(conversationId))
      .length;
    const allowedUnpinnedCount = Math.max(0, maxUnpinnedFullConversations - pinnedFullCount);
    const evictCount = Math.max(0, evictable.length - allowedUnpinnedCount);
    const evictedConversationIds: string[] = [];

    for (const conversation of evictable.slice(0, evictCount)) {
      const index = conversations.findIndex((item) => item.id === conversation.id);
      if (index === -1) {
        continue;
      }
      conversations[index] = cloneConversationMetadataOnly(conversation);
      this.forget(conversation.id);
      this.evictedConversationIds.add(conversation.id);
      evictedConversationIds.push(conversation.id);
    }

    return {
      fullConversationIds: conversations
        .filter(hasFullMessages)
        .map((conversation) => conversation.id),
      pinnedConversationIds: [...pinnedConversationIds],
      evictedConversationIds,
    };
  }
}
