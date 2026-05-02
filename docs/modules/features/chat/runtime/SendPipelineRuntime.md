# SendPipelineRuntime

> **源码**: `src/features/chat/runtime/SendPipelineRuntime.ts`
> **状态**: [REVIEW]

## 概述

`SendPipelineRuntime` 是第七阶段新增的发送子系统 runtime。它把原先仍挂在 `OpenCodianView.sendMessage()` 里的整条发送 ownership 搬成独立模块。第二刀后，它进一步变成发送子系统的 composition root，负责装配：

- 在真正 prepare/send 之前先给 slash command runtime owner 一个拦截机会
- 调用 `MessageSendPreparationService` 完成 send preflight / optimistic bootstrap
- 发起真实 `openCodeService.sendMessage()` stream，并创建 streaming shell 与 `StreamController`
- 把 stream loop / chunk router 交给 `StreamChunkRouter`
- 把本地 shell finalization / local assistant-notice persistence 交给 `StreamLocalFinalizer`
- 把 post-stream finalization 继续交给 `MessageFinalizationService`

它不是一个“小 helper”，而是发送子系统的总入口；`OpenCodianView` 现在只保留 host 装配与桥接。

## 公开接口

```typescript
export class SendPipelineRuntime {
  sendMessage(input: string | PrepareMessageSendOptions): Promise<void>;
}
```

同时它定义了三组协作边界：

- `SendPipelineSlashCommandPort`
- `SendPipelinePreparationPort`
- `SendPipelineFinalizationPort`
- `SendPipelineHost`

其中前两个分别复用 `MessageSendPreparationService` 与 `MessageFinalizationService`；host 在第八阶段起不再被视为单一“大接口”，而是由这几组窄 port 组合出来：

- `SendPipelineViewPort`
- `SendPipelineTransportPort`
- `SendPipelineShellPort`
- `SendPipelinePersistencePort`
- `SendPipelineDebugPort`

`SendPipelineRuntime` 本身继续拿组合后的 runtime host，但 `StreamChunkRouter`、`StreamLocalFinalizer`、`SendPipelineTrace` 等子模块只声明各自真正依赖的 port 子集。

第二刀后，runtime 子目录内部又继续细分成几层：

- `SendPipelineTypes`：共享契约层
- `AssistantShellRenderer`：assistant streaming shell 的创建、reveal 与 timestamp 收尾
- `PendingIndicatorController`：pending DOM 与计时器
- `AssistantNoticeRenderer`：stream error / interrupted notice 构造与占位 shell notice 渲染
- `SendPipelineTrace`：trace / progress debug
- `sendPipelineContent`：纯 content helper
- `buildLocalStreamOutcome`：本地收尾纯推导
- `StreamShellFinalizer`：streaming shell DOM 收尾
- `LocalStreamMessagePersistence`：assistant / notice 本地持久化

## 关键行为

### stream bootstrap

- 先调用可选的 `tryRunSlashCommand()`；如果输入已经被已知 slash command 消费，整个普通 streaming send path 直接短路
- 先把字符串或结构化 prompt input 归一化，再调用 `prepareMessageSend()` 获取 `PreparedMessageSend`
- 如果 active tab runtime 在 preparation 之后已经失效，直接中止，不继续发流
- 进入 streaming 状态后，再创建真实 stream、streaming shell 和 `StreamController`
- transport 层收到的是 `PreparedMessageSend.contextItems`，也就是“持久路径 + 一次性 composer context”的合并结果，而不是单独的 draft context
- transport 层现在还会直接复用 `PreparedMessageSend.messageID` 与 `requestParts`，避免 send preparation 和真正 transport 再各自生成一批不同的 part id
- 如果 preparation 阶段解析出了显式 main agent，transport 层还会把它透传给 `openCodeService.sendMessage()` 的 top-level `agent`
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
- `AssistantNoticeRenderer` 负责 notice message 构造与 assistant placeholder notice 渲染 adapter

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 不再直接拥有 `createSendPipelineRuntimeHost()`；host 装配 lifecycle 已移入本模块的 `createSendPipelineRuntimeHost()` 工厂函数
- `OpenCodianView` 只保留 `createSendPipelineHostDependencies()` 扁平依赖工厂，返回 `SendPipelineHostDependencies` 对象供 `createSendPipelineRuntimeHost()` 消费
- slash command 识别与 `runSessionCommand()` delegation 继续留在专用 `SlashCommandExecutionService`
- `createSendPipelineRuntimeHost()` 把 `SendPipelineHostDependencies` 按 view / transport / shell / persistence / debug 五类 host 能力分组后再组合成完整 `SendPipelineHost`
- `MessageSendPreparationService` 只负责“发之前能不能发、optimistic user message 何时落地、何时进入 streaming state”
- `PreparedMessageSend` 现在是 send preparation 与 transport 之间的稳定 payload handoff，负责把 canonical seed 使用的 `messageID + parts[]` 原样带进 `openCodeService.sendMessage()`
- `SendPipelineRuntime` 负责“真正发流，并装配 chunk router / local finalizer / post-stream finalizer”
- `StreamChunkRouter` 负责“消费 chunk、pending/timeout、stream trace”
- `StreamLocalFinalizer` 负责“本地 shell finalization、第一次本地保存”
- `MessageFinalizationService` 负责“stream 结束后是否 sync、sync 后如何 patch/rerender、最后如何做 todo/save/attention 收尾”

## 风险点

- 不能破坏多 tab 并发 streaming 与 tab runtime 隔离语义
- 不能改变 optimistic user message 先落地再开流的时序
- 不能改变 pending indicator / idle timeout / interrupted notice 的优先级
- 不能把 `MessageSendPreparationService` 或 `MessageFinalizationService` 的职责重新回灌进 runtime host
