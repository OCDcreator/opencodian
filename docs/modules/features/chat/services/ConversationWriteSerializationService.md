# ConversationWriteSerializationService

> **源码**: `src/features/chat/services/ConversationWriteSerializationService.ts`
> **状态**: [REVIEW]
> **最近更新**: Per-conversation write serialization

## 概述

`ConversationWriteSerializationService` 为 `Conversation.messages` compatibility/cache writeback 提供 per-conversation 串行化与 monotonic ticket guard。它让同一 conversation 的异步写入按队列顺序执行，并用 ticket version 跳过已经过期的写入。

它不理解消息 merge 语义，也不直接调用 storage save。具体写入函数由调用方注入，OpenCodianView 的 `commitConversationWrite()` 是当前统一 save boundary。

## 公开接口

```typescript
export interface ConversationWriteTicket {
  readonly conversationId: string;
  readonly version: number;
}

export interface ConversationWriteCommitResult {
  readonly applied: boolean;
  readonly version: number;
  readonly reason: string;
}

export interface ConversationWriteCommitOptions {
  readonly conversation: Conversation;
  readonly ticket: ConversationWriteTicket;
  readonly reason: string;
  readonly write: () => void | Promise<void>;
}

export class ConversationWriteSerializationService {
  createTicket(conversationId: string): ConversationWriteTicket;
  getVersion(conversationId: string): number;
  commit(options: ConversationWriteCommitOptions): Promise<ConversationWriteCommitResult>;
}
```

## 关键行为

- `createTicket()` 基于 conversation 当前 committed version 与 pending write count 分配 monotonic ticket。
- `commit()` 以 conversation id 为 key 维护独立 promise queue；同一 conversation 的写入串行执行。
- 不同 conversation id 使用不同 queue，彼此不会阻塞。
- 写入执行前会比较 ticket 的 `conversationId` 与当前 version；不匹配时返回 `applied: false`，并跳过 `write()`。
- 成功执行 `write()` 后 version 递增，返回 `applied: true` 与新的 version。
- 前一个 queued commit 即使 reject，后续同 conversation commit 仍会继续排队执行。

## 与 `OpenCodianView` 的边界

- `OpenCodianView.createConversationWriteTicket()` 是 ticket 创建入口。
- `OpenCodianView.commitConversationWrite()` 注入实际 write callback，并在 write 成功应用时负责调用 conversation save boundary。
- send preparation、local stream persistence、message finalization、authoritative reload/sync 等热点只通过 host port 创建 ticket 与提交 write，不直接绕过该 serialization service。
- 本服务只保护 `Conversation.messages` compatibility/cache writes；canonical session graph、LRU/full-message cache 与 canonical eviction 策略仍属于单独的存储/cache plan。
