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

## 注意事项

- 队列在关闭后不再接受新消息，已排队的等待者会收到 `done: true`。
- `ClaudeCodeSessionRuntime.effort` 记录创建当前 SDK query 时使用的 Claude Code effort；adapter 用它判断 composer effort 变化时是否需要重启 resumed query。
- `ClaudeCodeSessionRuntime.query` 是 Claude SDK `Query` 的窄类型，只列出 adapter 会用到的控制方法：`interrupt`、`setModel`、`setPermissionMode`、`setMcpServers`、`supportedModels` 和 `close`。`setMcpServers` 返回值按 SDK 的结果对象处理为 `Promise<unknown>`，调用方不假设它是 `void`。
- 从 `ClaudeCodeAdapter` 提取以控制文件行数，不影响公共 API。
