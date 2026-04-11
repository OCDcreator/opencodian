# StreamLocalFinalizer

> **源码**: `src/features/chat/runtime/StreamLocalFinalizer.ts`
> **状态**: [REVIEW]

## 概述

`StreamLocalFinalizer` 是 `SendPipelineRuntime` 内部的本地 stream 收尾模块。它接收 `StreamChunkRouter` 的消费结果，负责把本地 streaming shell、conversation message 和第一次本地保存整理完成，然后把 post-stream sync 继续留给 `MessageFinalizationService`。

它负责：

- 计算 finalized timestamp / model id / assistant message id
- 判定 `shouldSyncFromServer`
- 复位 streaming 状态并清理 pending indicator
- 把 streaming shell 收尾成 timestamp / error notice / interrupted notice / removed
- 从 `StreamController` 的 persisted content blocks 构建本地 assistant `ChatMessage`
- 追加 error notice 或 interrupted notice
- 完成第一次本地 `saveConversation()`
- 清空 tab runtime 的 streaming DOM 与 question resolution 临时状态

第二刀后，这个模块已经主要承担 orchestration；纯推导和具体落地又继续拆给：

- `buildLocalStreamOutcome`
- `StreamShellFinalizer`
- `LocalStreamMessagePersistence`

## 公开接口

```typescript
export class StreamLocalFinalizer {
  finalize(): Promise<StreamLocalFinalizerResult>;
}
```

`StreamLocalFinalizerResult` 包含：

- `shouldSyncFromServer`
- `logAssistantFinalizationStage()`

其中 logger 会继续传给 `MessageFinalizationService`，让同一次发送链路的 trace id 保持连续。

## 关键行为

### should-sync 判定

`StreamLocalFinalizer` 通过 `buildLocalStreamOutcome()` 复用 `shouldSyncAfterStream()`：

- stream 必须正常收到 `message_stop`
- 不能 timeout
- 不能 interruption
- 不能有 latest error

满足时才让后续 `MessageFinalizationService` 发起最终 server sync。

### shell finalization

- 有 content blocks：追加 timestamp / copy button，并在 interrupted 时显示 interrupted badge
- 只有 error：把占位 assistant shell 渲染成 error notice card
- interrupted 且无内容：把占位 shell 渲染成 interrupted notice
- 既无内容又无 notice：移除空 shell

### local message persistence

- 有 stream content blocks 时构造 assistant `ChatMessage`
- error / interrupted 分支构造 notice message
- 只要有本地 message / notice，就更新 `updatedAt`、`lastResponseAt` 并执行第一次本地 save

这两段已经分别下放到 `StreamShellFinalizer` 与 `LocalStreamMessagePersistence`；`StreamLocalFinalizer` 自身主要负责调用顺序和 runtime 清理顺序。

## 协作边界

- 不消费 stream chunk
- 不处理 permission/question UI
- 不执行最终 server sync 或 post-sync rerender
- 与 `MessageFinalizationService` 的边界是 `shouldSyncFromServer`、`editedFiles` 和 trace logger
