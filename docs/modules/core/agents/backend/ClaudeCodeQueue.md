# Claude Code Queue

> **源码**: `src/core/agents/backend/ClaudeCodeQueue.ts`
> **状态**: [ACTIVE]

## 概述

为 Claude Code 持久查询提供异步队列和运行时辅助类型。`ClaudeCodeAsyncQueue` 是一个单消费者异步迭代队列，用于将用户提示送入持久 SDK 查询并将 SDK 消息传回适配器的流式生成器。

## 导入关系

上游: `ClaudeCodeStreamNormalizer`（类型引用）
下游: `ClaudeCodeAdapter`

## 核心类型

| 类型 | 说明 |
|------|------|
| `ClaudeCodeQueuedPrompt` | 入队用户消息结构 |
| `ClaudeCodeRuntimeOutput` | 运行时输出事件（message / error） |
| `ClaudeCodeSessionRuntime` | 会话运行时状态（input queue、output queue、normalizer、abort controller、当前 effort、query handle） |

## 核心导出

| 导出 | 说明 |
|------|------|
| `ClaudeCodeAsyncQueue<T>` | 单消费者异步迭代队列，支持 push / close |
| `createSessionId()` | 生成 `claude-code-{timestamp}-{random}` 格式的会话 ID |
| `createUserPrompt()` | 构造标准用户消息结构 |
| `isTurnBoundaryMessage()` | 判断 SDK 消息是否为 result 边界 |
| `isPromptSuggestionMessage()` | 判断 SDK 消息是否为 prompt_suggestion 类型 |

## 注意事项

- 队列在关闭后不再接受新消息，已排队的等待者会收到 `done: true`。
- `ClaudeCodeSessionRuntime.effort` 记录创建当前 SDK query 时使用的 Claude Code effort；adapter 用它判断 composer effort 变化时是否需要重启 resumed query。
- `ClaudeCodeSessionRuntime.query` 是 Claude SDK `Query` 的窄类型，只列出 adapter 会用到的控制方法：`interrupt`、`setModel`、`setPermissionMode`、`setMcpServers`、`rewindFiles`、`supportedModels` 和 `close`。`setMcpServers` 与 `rewindFiles` 返回值按 SDK 的结果对象处理为 `Promise<unknown>`，调用方不假设具体结构。
- `interrupt` 返回值同样按 `Promise<unknown>` 处理（2026-09-02，SDK 0.3.252 起 `Query.interrupt()` 解析为 `SDKControlInterruptResponse | undefined`——带 `interrupt_receipt_v1` 能力的 CLI 会返回 still-queued 异步消息回执）。插件侧丢弃回执（`void ...interrupt?.()`），不假设具体结构。
- 从 `ClaudeCodeAdapter` 提取以控制文件行数，不影响公共 API。

## 图片消息约定（2026-07-22）

- `ClaudeCodeQueuedPrompt` 继承官方 `SDKUserMessage`，故每条用户消息都显式携带必填的 `parent_tool_use_id: null`。
- `createUserPrompt(prompt, images)` 在纯文本时保留 SDK 的字符串 content 快路径；有图片时生成 base64 `image` content blocks，空文字加图片则只发送图片数组。
- 队列只序列化 composer 已读取完成的 JPEG、PNG、GIF 或 WebP base64 数据，不读文件、不负责 UI 预览。

## 2026-09-02 SDK 0.3.252 消息谓词

- 新增 `isConversationResetMessage` / `isCommandsChangedMessage` / `readConversationResetId`：分别识别顶层 `conversation_reset` 消息（CLI 把会话移到新 id）、`system/commands_changed`（slash 命令目录变化），供 adapter pump 侧在消息进入流消费者前做身份重映射与订阅通知。
- 2026-09-08：活动 query 兼容形状新增 `reloadSkills?: () => Promise<unknown>`，供设置页在资源写入后原地刷新；旧 CLI 拒绝由设置 owner 退回 runtime restart。
