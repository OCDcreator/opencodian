# AcpTransportOwner

> **源码**: `src/core/acp/AcpTransportOwner.ts`
> **状态**: [REVIEW]

## 概述

`AcpTransportOwner` 是 ACP 通知到 OpenCodian `StreamChunk` 的翻译 owner。它负责创建或复用 ACP session、发送用户消息、订阅 ACP notification，并把文本、thinking、tool、usage、permission 和 done 信号转成聊天流可消费的 chunk；permission chunk 会带上当前 ACP `sessionID`，保持与 OpenCode SSE permission chunk 的形状一致。

## 关键导出

- `translateAcpMessageChunk()`: 将 ACP 文本或 thinking 文本转换为 `StreamChunk`。
- `translateAcpToolCall()`: 将 ACP tool call 转换为 `tool_use` chunk。
- `translateAcpToolCallUpdate()`: 将 ACP tool call update 转换为 `tool_result` chunk。
- `AcpTransportOwner`: 串接 ACP send/session/notification seam 并产出 async streaming chunks 的 class。

## 核心逻辑

### Chunk 翻译

- 普通 text notification 转换为 `text` chunk。
- 带 `partId` 的 thinking notification 转换为 `thinking` chunk。
- tool call 与 tool update 分别转换为 `tool_use` 与 `tool_result`。
- usage notification 转换为 token usage chunk。
- permission request 转换为 `permission_request` chunk，并保留 tool 和 patterns。

### 消息发送

- `sendMessage()` 未收到 session id 时先调用 `createSession()`。
- 成功建立发送流程后先 yield `message_start`，结束时 yield `message_stop`。
- notification handler 将转换后的 chunks 放入队列，并通过 wake callback 驱动 async generator 继续产出。

### 终止和错误

- session 创建失败会产出 `error` chunk 并结束。
- ACP send / stream 过程中抛错会产出 `ACP error` chunk。
- `abort()` 设置中止标记，使 `sendMessage()` 停止等待更多 notification。
- `done` notification 只控制流结束，不额外产出 chunk。

## 依赖

- `src/core/types/chat`: 提供 `StreamChunk` 类型。
- 构造函数注入的 ACP seams: `sendMessageToAcp()`、`createSession()`、`onNotification()`。

## 注意事项

- 该模块不直接拥有子进程或 wire protocol，只依赖注入的 ACP transport seam。
- notification queue 会在结束前排空，避免 done 前已收到的 chunk 丢失。
- `unsubscribe()` 在 finally 中调用，确保异常或 abort 后释放 notification 订阅。
