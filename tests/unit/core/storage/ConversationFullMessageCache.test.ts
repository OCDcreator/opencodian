import {
  cloneConversationMetadataOnly,
  ConversationFullMessageCache,
} from '../../../../src/core/storage/ConversationFullMessageCache';
import type { Conversation } from '../../../../src/core/types';

function createConversation(
  id: string,
  updatedAt: number,
  messageCount: number,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: updatedAt - 1,
    updatedAt,
    openCodeSessionId: `session-${id}`,
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `${id}-msg-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message ${index}`,
      timestamp: updatedAt + index,
    })),
  };
}

describe('ConversationFullMessageCache', () => {
  it('returns a metadata-only clone without mutating the original conversation', () => {
    const full = createConversation('one', 10, 2);

    const metadataOnly = cloneConversationMetadataOnly(full);

    expect(metadataOnly).toEqual({
      ...full,
      messages: [],
    });
    expect(full.messages).toHaveLength(2);
  });

  it('keeps pinned conversations with full messages even when over capacity', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('pinned', 30, 2),
      createConversation('old', 10, 2),
    ];
    cache.touch('pinned', 300);
    cache.touch('old', 100);

    const snapshot = cache.trim(conversations, new Set(['pinned']));

    expect(conversations.find((item) => item.id === 'pinned')?.messages).toHaveLength(2);
    expect(conversations.find((item) => item.id === 'old')?.messages).toHaveLength(0);
    expect(snapshot.evictedConversationIds).toEqual(['old']);
    expect(snapshot.pinnedConversationIds).toEqual(['pinned']);
    expect(snapshot.fullConversationIds).toEqual(['pinned']);
  });

  it('evicts least-recently-used unpinned conversations and keeps the newest touches', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 2 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('middle', 20, 1),
      createConversation('new', 30, 1),
    ];
    cache.touch('old', 100);
    cache.touch('middle', 200);
    cache.touch('new', 300);

    const snapshot = cache.trim(conversations, new Set());

    expect(conversations.map((conversation) => [
      conversation.id,
      conversation.messages.length,
    ])).toEqual([
      ['old', 0],
      ['middle', 1],
      ['new', 1],
    ]);
    expect(snapshot.evictedConversationIds).toEqual(['old']);
    expect(snapshot.fullConversationIds).toEqual(['middle', 'new']);
  });

  it('forgets deleted conversations from LRU tracking', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    cache.touch('gone', 100);
    cache.touch('kept', 200);
    const conversations = [
      createConversation('gone', 10, 1),
      createConversation('kept', 20, 1),
    ];
    cache.trim(conversations, new Set());
    expect(cache.isEvicted('gone')).toBe(true);

    cache.forget('gone');

    expect(cache.getTrackedConversationIds()).toEqual(['kept']);
    expect(cache.isEvicted('gone')).toBe(false);
  });

  it('is idempotent when trimming twice with the same state', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('new', 20, 1),
    ];
    cache.touch('old', 100);
    cache.touch('new', 200);

    const first = cache.trim(conversations, new Set());
    const second = cache.trim(conversations, new Set());

    expect(first.evictedConversationIds).toEqual(['old']);
    expect(second.evictedConversationIds).toEqual([]);
    expect(conversations[0].messages).toHaveLength(0);
    expect(conversations[1].messages).toHaveLength(1);
  });

  it('evicts all unpinned conversations when maxFullConversations is zero', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 0 });
    const conversations = [
      createConversation('a', 10, 1),
      createConversation('b', 20, 1),
    ];
    cache.touch('a', 100);
    cache.touch('b', 200);

    const snapshot = cache.trim(conversations, new Set());

    expect(conversations[0].messages).toHaveLength(0);
    expect(conversations[1].messages).toHaveLength(0);
    expect(snapshot.evictedConversationIds).toEqual(['a', 'b']);
  });

  it('evicts nothing when all conversations are pinned over capacity', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('a', 10, 1),
      createConversation('b', 20, 1),
    ];
    cache.touch('a', 100);
    cache.touch('b', 200);

    const snapshot = cache.trim(conversations, new Set(['a', 'b']));

    expect(conversations[0].messages).toHaveLength(1);
    expect(conversations[1].messages).toHaveLength(1);
    expect(snapshot.evictedConversationIds).toEqual([]);
  });

  it('tracks evicted conversations until they are rehydrated', () => {
    const cache = new ConversationFullMessageCache({ maxFullConversations: 1 });
    const conversations = [
      createConversation('old', 10, 1),
      createConversation('new', 20, 1),
    ];
    cache.touch('old', 100);
    cache.touch('new', 200);

    cache.trim(conversations, new Set());
    expect(cache.isEvicted('old')).toBe(true);

    cache.touch('old', 300);
    expect(cache.isEvicted('old')).toBe(false);
  });
});
