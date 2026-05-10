# ConversationWriteSerializationService

> **源码**: `src/features/chat/services/ConversationWriteSerializationService.ts`
> **状态**: [REVIEW]
> **最近更新**: Per-conversation write serialization

## 概述

`ConversationWriteSerializationService` 为 `Conversation.messages` compatibility/cache writeback 提供 per-conversation 串行化与 monotonic ticket guard。它让同一 conversation 的异步写入按队列顺序执行，并用 ticket version 跳过已经过期的写入。

它不理解消息 merge 语义，也不直接调用 storage save。具体写入函数由调用方注入，`OpenCodianView.commitConversationWrite()` 是当前统一 save boundary。默认 service 实例共享同一 workspace 级队列状态，因此多个 `OpenCodianView` pane 即使各自持有 service 实例，也会共享同一 conversation 的 ticket/version 序列。

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
  readonly rejected?: boolean;
}

export interface ConversationWriteCommitOptions {
  readonly conversation: Conversation;
  readonly ticket: ConversationWriteTicket;
  readonly reason: string;
  readonly write: () => void | Promise<void>;
}

export interface ConversationWriteQueueTimeoutDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly ageMs: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteQueueDepthDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteQueueRejectedDiagnostic
  extends ConversationWriteQueueDepthDiagnostic {
  readonly rejectedReason: string;
  readonly maxQueueDepth: number;
}

export interface ConversationWriteSerializationOptions {
  readonly queueTimeoutMs?: number;
  readonly maxQueueDepth?: number;
  readonly onQueueTimeout?: (diagnostic: ConversationWriteQueueTimeoutDiagnostic) => void;
  readonly onQueueDepthChange?: (diagnostic: ConversationWriteQueueDepthDiagnostic) => void;
  readonly onQueueRejected?: (diagnostic: ConversationWriteQueueRejectedDiagnostic) => void;
  readonly now?: () => number;
  readonly scope?: 'shared' | 'instance';
  readonly setTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}

export class ConversationWriteSerializationService {
  constructor(options?: ConversationWriteSerializationOptions);
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
- 可选 queue timeout diagnostics：当同一 conversation 的队列超过配置时间仍未清空时，只报告 conversation id、pending 数量、队列年龄与首尾 reason；不会取消、跳过或重排写入。
- 默认构造使用 `shared` scope，让多个 view-local service 实例共享 per-conversation queue；单元测试可传 `scope: 'instance'` 获得隔离状态。
- queue depth diagnostics 会在 enqueue/dequeue 时报告每个 conversation queue 的当前 pending 数量与首尾 reason，默认写入 debug 日志。
- circuit breaker 默认 `maxQueueDepth` 为 75。超过阈值时只拒绝新写入并返回 `applied: false, rejected: true`；不会取消已有写入，也不会让后续写入绕过前序写入。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍持有一个 service 实例，避免扩大 `OpenCodianView.ts` 或 `src/main.ts` 的 runtime ownership；跨 pane 共享由本 service 的默认 shared scope 提供。
- `OpenCodianView.createConversationWriteTicket()` 是 ticket 创建入口。
- `OpenCodianView.commitConversationWrite()` 注入实际 write callback，并在 write 成功应用时负责调用 conversation save boundary。
- service 默认 `onQueueRejected` 会记录 warning；业务调用方仍通过 `applied: false` 走已有 skip/diagnostic 分支，不需要在 `OpenCodianView.ts` 增长额外 runtime ownership。
- send preparation、local stream persistence、message finalization、authoritative reload/sync 等热点只通过 host port 创建 ticket 与提交 write，不直接绕过该 serialization service。
- 本服务只保护 `Conversation.messages` compatibility/cache writes；canonical session graph、LRU/full-message cache 与 canonical eviction 策略仍属于单独的存储/cache plan。
- timeout diagnostics 是观测机制，不是降级写入机制。`StorageService.saveConversation()` 没有取消/compare-and-swap 语义，因此不能在旧写入未完成时放行新写入，否则旧写入稍后落盘可能覆盖新消息。
