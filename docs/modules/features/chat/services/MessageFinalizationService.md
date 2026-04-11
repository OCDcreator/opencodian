# MessageFinalizationService

> **源码**: `src/features/chat/services/MessageFinalizationService.ts`
> **状态**: [REVIEW]

## 概述

`MessageFinalizationService` 负责接管 `sendMessage()` 在 stream loop 结束之后的 finalization orchestration：

- 判定是否需要最终服务端 sync
- 调用会话最终 sync 并复用既有 render orchestration
- 在 sync 后按需执行 tail patch 或 full rerender
- 继续推进 background-task indicator、turn diff、session todos 和最终保存

它不消费流式 chunk，也不直接控制 streaming shell。真实的 chunk 消费、pending/timeout/interruption、本地 assistant/notice 组装与第一次本地保存现在保留在 `runtime/SendPipelineRuntime.ts`。

## 公开接口

```typescript
export function shouldSyncAfterStream(
  options: ShouldSyncAfterStreamOptions,
): boolean;

export interface FinalizeMessageOptions {
  conversation: Conversation;
  tabId: TabId | null;
  shouldSyncFromServer: boolean;
  editedFiles: string[];
  logStage(stage: string, payload?: Record<string, unknown>): void;
}

export class MessageFinalizationService {
  finalizeAfterStream(options: FinalizeMessageOptions): Promise<void>;
}
```

## 关键行为

### should-sync 判定

- 只有 `streamCompleted === true`
- 且没有 timeout
- 且没有 interruption
- 且没有真实错误消息

同时满足时，才进入最终服务端 sync。

### post-sync 编排

- final sync 前先快照 `previousMessagesBeforeSync` 和 visual fingerprint
- sync 完成后，如果当前仍是同一个 foreground conversation/tab，且 visual fingerprint 发生变化，则优先尝试 `patchTrailingAssistantRender()`
- tail patch 失败时回退 `rerenderConversationMessages()`
- 不重新实现 append / patch / full rerender 细节，而是复用已有 `ConversationRenderService` 边界

### 收尾时序

- 只有 should-sync 分支才执行最终服务端 sync、background indicator 刷新与 turn diff notice
- 不论是否 should-sync，都会继续刷新 session todos、写最终 save、清空 pending edited files
- 如果用户在 finalization 期间切走 tab，则不做 foreground patch/rerender 与 active-tab context usage 刷新，而是改为给原 tab 打 attention
- sync lock 会在 service 自己的 `finally` 中释放，避免 send finalization 途中遗漏解锁

## 与 `OpenCodianView` 的边界

- `SendPipelineRuntime` 仍保留 stream loop、本地 shell finalization、本地 assistant/notice message 构建，以及第一次 `saveConversation()`
- `MessageFinalizationService` 只负责“stream 结束后是否 sync、sync 后如何 patch/rerender、最后如何做 todo/save/attention 收尾”
- `ConversationRenderService` 继续负责消息区 full rerender、append-only sync 和 tail patch，本服务只决定何时调用它
