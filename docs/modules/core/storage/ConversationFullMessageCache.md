# ConversationFullMessageCache

> **源码**: `src/core/storage/ConversationFullMessageCache.ts`
> **状态**: [REVIEW]

## 概述

`ConversationFullMessageCache` 是完整 conversation message 数组的内存保留策略 owner。它不读写磁盘，不知道 Obsidian adapter，也不决定 conversation list 的排序；它只根据 pin 集合与 LRU touch 时间，把 unpinned 的完整 `Conversation.messages` 从内存对象中裁剪为空数组。

## 公开接口

```typescript
interface ConversationFullMessageCacheOptions {
  readonly maxFullConversations: number;
}

interface ConversationFullMessageCacheSnapshot {
  readonly fullConversationIds: string[];
  readonly pinnedConversationIds: string[];
  readonly evictedConversationIds: string[];
}

function cloneConversationMetadataOnly(conversation: Conversation): Conversation;

class ConversationFullMessageCache {
  touch(conversationId: string, now?: number): void;
  forget(conversationId: string): void;
  getTrackedConversationIds(): string[];
  isEvicted(conversationId: string): boolean;
  trim(
    conversations: Conversation[],
    pinnedConversationIds: ReadonlySet<string>,
  ): ConversationFullMessageCacheSnapshot;
}
```

## 关键行为

- pinned conversations 永远不会被 `trim()` 清空 messages。
- unpinned conversations 按 `touch()` 时间从旧到新驱逐。
- `isEvicted(id)` 只在当前内存生命周期内标记“messages 被 LRU 裁剪过”，用于保存前防止 metadata-only conversation 覆盖磁盘完整消息。
- 驱逐只影响内存对象，完整消息仍保存在 `.opencodian/sessions/{id}.json`。
- 被驱逐 conversation 会保留 id/title/timestamps/openCodeSessionId/sessionSettings/backgroundTaskMetadata 等 metadata 字段。

## 边界

- 本模块不调用 `StorageService.loadFullConversation()`。
- 本模块不调用 `StorageService.saveConversation()`。
- 本模块不访问 `OpenCodianView` 或 tab runtime。
