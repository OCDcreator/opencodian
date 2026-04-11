# SendPipelineRuntime

> **源码**: `src/features/chat/runtime/SendPipelineRuntime.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineRuntime` 是第七阶段新增的发送子系统 runtime。它把原先仍挂在 `OpenCodianView.sendMessage()` 里的整条发送 ownership 搬成独立模块。第二刀后，它进一步变成发送子系统的 composition root，负责装配：

- 调用 `MessageSendPreparationService` 完成 send preflight / optimistic bootstrap
- 发起真实 `openCodeService.sendMessage()` stream，并创建 streaming shell 与 `StreamController`
- 把 stream loop / chunk router 交给 `StreamChunkRouter`
- 把本地 shell finalization / local assistant-notice persistence 交给 `StreamLocalFinalizer`
- 把 post-stream finalization 继续交给 `MessageFinalizationService`

它不是一个“小 helper”，而是发送子系统的总入口；`OpenCodianView` 现在只保留 host 装配与桥接。

## 公开接口

```typescript
export class SendPipelineRuntime {
  sendMessage(content: string): Promise<void>;
}
```

同时它定义了三组协作边界：

- `SendPipelinePreparationPort`
- `SendPipelineFinalizationPort`
- `SendPipelineHost`

其中前两个分别复用 `MessageSendPreparationService` 与 `MessageFinalizationService`，host 则把 view 内部仍需使用的 DOM、tab runtime、stream/controller 与 notice 渲染能力桥接进来。

第二刀后，runtime 子目录内部又继续细分成几层：

- `SendPipelineTypes`：共享契约层
- `PendingIndicatorController`：pending DOM 与计时器
- `SendPipelineTrace`：trace / progress debug
- `sendPipelineContent`：纯 content helper
- `buildLocalStreamOutcome`：本地收尾纯推导
- `StreamShellFinalizer`：streaming shell DOM 收尾
- `LocalStreamMessagePersistence`：assistant / notice 本地持久化

## 关键行为

### stream bootstrap

- 先调用 `prepareMessageSend()` 获取 `PreparedMessageSend`
- 如果 active tab runtime 在 preparation 之后已经失效，直接中止，不继续发流
- 进入 streaming 状态后，再创建真实 stream、streaming shell 和 `StreamController`
- 把 stream、controller、tab runtime 与 prepared send 交给 `StreamChunkRouter`

### chunk router

chunk router 现在由 `runtime/StreamChunkRouter.ts` 承接，并继续下钻到更细的 helper：

- `message_start`：触发最新 user message authoritative sync，并开始 tab context usage stream
- `usage`：立即应用到 tab 级 context usage
- `message_metadata`：记录最终 assistant `messageId` / `timestamp` / `modelId`
- `message_stop`：标记 stream 正常完成
- `file_edited`：累计到 tab runtime 的 `pendingEditedFiles`
- `permission_request` / `question_request`：暂停 idle timeout，等待现有交互流完成后再恢复计时
- 其余可渲染 chunk：统一交给 `StreamController`

其中：

- `PendingIndicatorController` 负责 1 秒延迟 pending DOM
- `SendPipelineTrace` 负责 raw/rendered chunk trace 与 progress 节流日志
- `sendPipelineContent.hasVisibleStreamingContent()` 负责首个可见内容判定

### 本地 finalization

本地 finalization 现在由 `runtime/StreamLocalFinalizer.ts` 承接，并再次拆成 outcome / shell / persistence 三层：

- 如果 stream 没有任何可见内容，也没有真实 error，会先注入 fallback error
- local finalization 阶段会统一处理：
  - streaming 状态复位
  - pending indicator 清理
  - streaming shell 收尾
  - 本地 assistant message / error notice / interrupted notice 的构建与追加
  - 第一次本地 `saveConversation()`
- 最后再把 `shouldSyncFromServer`、`editedFiles` 和调试 logger 一并交给 `MessageFinalizationService`

其中：

- `buildLocalStreamOutcome` 负责纯推导最终 outcome
- `StreamShellFinalizer` 负责把 streaming shell 落成 timestamp / notice / removed
- `LocalStreamMessagePersistence` 负责第一次本地 `saveConversation()`

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 `createSendPipelineRuntimeHost()` 与 `sendMessage()` bridge
- `MessageSendPreparationService` 只负责“发之前能不能发、optimistic user message 何时落地、何时进入 streaming state”
- `SendPipelineRuntime` 负责“真正发流，并装配 chunk router / local finalizer / post-stream finalizer”
- `StreamChunkRouter` 负责“消费 chunk、pending/timeout、stream trace”
- `StreamLocalFinalizer` 负责“本地 shell finalization、第一次本地保存”
- `MessageFinalizationService` 负责“stream 结束后是否 sync、sync 后如何 patch/rerender、最后如何做 todo/save/attention 收尾”

## 风险点

- 不能破坏多 tab 并发 streaming 与 tab runtime 隔离语义
- 不能改变 optimistic user message 先落地再开流的时序
- 不能改变 pending indicator / idle timeout / interrupted notice 的优先级
- 不能把 `MessageSendPreparationService` 或 `MessageFinalizationService` 的职责重新回灌进 runtime host
