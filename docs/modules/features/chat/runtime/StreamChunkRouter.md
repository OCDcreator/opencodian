# StreamChunkRouter

> **源码**: `src/features/chat/runtime/StreamChunkRouter.ts`
> **状态**: [REVIEW]

## 概述

`StreamChunkRouter` 是 `SendPipelineRuntime` 内部的 stream loop / chunk router。它接管第七阶段第一次落地后仍在 `SendPipelineRuntime.sendMessage()` 里的流式消费细节，让发送 runtime 只保留发送入口与模块装配。

它负责：

- 启动 `StreamController`
- 显示和清理 1 秒延迟 pending indicator
- 维护无可见内容 60 秒 / 已有内容后 5 分钟的 idle timeout，并在超时后 detach 本地 stream
- 消费 OpenCode stream chunk
- 记录发送链路调试 trace 与 progress checkpoint
- 返回 stream 完成/中断/超时/error/metadata 状态，供 `StreamLocalFinalizer` 使用

第二刀后，router 自己也只保留流程编排；pending UI、trace 和内容可见性规则分别下放到：

- `PendingIndicatorController`
- `SendPipelineTrace`
- `sendPipelineContent`

## 公开接口

```typescript
export class StreamChunkRouter {
  consume(): Promise<StreamChunkRouterResult>;
}
```

`StreamChunkRouterResult` 包含：

- `streamCompleted`
- `streamInterrupted`
- `streamTimedOut`
- `latestErrorMessage`
- `finalizedAssistantMetadata`
- `finalizedBackendSessionId`
- `logAssistantFinalizationStage()`
- `resetStreamingState()`
- `cleanupPendingIndicator()`

## 关键行为

### 控制 chunk

- `message_start`：触发最新 user message authoritative sync，并开始 context usage stream
- `usage`：更新 tab context usage
- `message_metadata`：记录最终 assistant message id / timestamp / model id，并把可选 `sessionId` 暴露为 backend-neutral finalized session identity
- `message_stop`：标记 stream 正常完成，并结束 context usage stream
- `file_edited`：追加到 tab runtime 的 `pendingEditedFiles`

### 交互 chunk

- `permission_request` 与 `question_request` 会先暂停 idle timeout
- 现有 dialog / dock 交互完成后，如果 tab 仍在 streaming，再重新启动 idle timeout
- 这保持了原先“用户交互等待不误判为 stream 卡死”的行为

### 超时策略

- 在没有任何 meaningful / 可见 chunk 到达前，router 使用 60 秒 no-visible-content timeout，避免 prompt 被服务端接受但长期没有 assistant 输出时让用户持续等待。
- 一旦 text / thinking / tool / question / permission 等 meaningful chunk 到达，router 切回 5 分钟 idle timeout，保留长任务和工具调用的耐心窗口。
- timeout log 会记录 `timeoutReason`，区分 `no-visible-content` 与 `idle-after-content`。
- timeout detach 使用 `getConversationBackendSessionId()` 解析 session id；这让本地 stream 取消路径不再硬依赖 `openCodeSessionId`，但最终 sync/history 仍按各 backend capability 分阶段迁移。

### 可渲染 chunk

- text / thinking / tool / error 等可转换 chunk 继续交给 `StreamController`
- error chunk 会先经过 view host 的 friendly error formatter
- 首个可见内容到达时，会清理 pending indicator 并记录 `pending-indicator-cleared`
- 如果 stream 结束时没有任何 meaningful chunk，也没有真实 error，会注入 fallback error

“首个可见内容”的定义已经统一收敛到 `sendPipelineContent.hasVisibleStreamingContent()`，避免 router、finalizer、渲染层各自定义。

## 协作边界

- 不负责构建持久化 assistant / notice message
- 不负责最终服务端 sync
- 不直接保存 conversation
- 只把消费结果和 trace logger 交给 `StreamLocalFinalizer`
