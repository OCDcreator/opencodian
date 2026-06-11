# CodexAppServerClient

> **源码**: `src/core/agents/backend/CodexAppServerClient.ts`
> **状态**: [RUNTIME_ADJUNCT]
> **Updated**: 2026-06-11 Checkpoint 15E

## 概述

`CodexAppServerClient` 是 Codex 本地 app-server 的轻量级 adjunct 客户端，仅用于 persisted session discovery 和 transcript readback。主 chat send/stream 路径仍走 TypeScript SDK 路由。

## 职责

- 通过 JSON-RPC 2.0 over WebSocket 与本地 `codex app-server` 通信
- `start()`: 启动 app-server 子进程 (`codex app-server --listen ws://127.0.0.1:0`)，从 stdout 和 stderr 扫描 WebSocket URL（Codex CLI 将 listening URL 输出到 stderr），连接并初始化 JSON-RPC 会话
- `stop()`: 关闭 WebSocket，终止子进程，清理 pending requests
- `listThreads(limit)`: 调用 `thread/list` 获取 persisted thread 列表
- `readThread(threadId, includeTurns)`: 调用 `thread/read` 获取单个 thread 的元数据和 turns
- `listPermissionProfiles(options)`: 调用 `permissionProfile/list` 获取可用权限配置文件列表（Checkpoint 15C）；支持可选 `cwd`、`limit`、`cursor` 参数；返回 `AppServerPermissionProfile[]`（含 `id` 和可选 `description`）
- `getAccountRateLimits()`: 调用 `account/rateLimits/read` 获取账号速率限制信息（Checkpoint 15D）；返回 `AppServerRateLimits`（含 `rateLimits` 和可选 `rateLimitsByLimitId`），错误或不可用时返回 `null`
- `getAccountUsage()`: 预留的 account usage adjunct route（Checkpoint 15E）；当前实现故意**不发送空 `params` payload**，因为早期协议快照把这条 route 视为无参请求；返回 `AppServerAccountUsage`（含 `summary` 和可选 `dailyUsageBuckets`），错误或不可用时返回 `null`
- 提供静态归一化方法 `normalizeThreadList()` 和 `normalizeTurnsToPreviewMessages()`，把 app-server 原始数据转换为 `AgentBackendRouting` 可消费的形状
  - `normalizeTurnsToPreviewMessages()` 从 `userMessage.content[]`（提取 `type === 'text'` 的部分）和 `agentMessage.text` 中提取对话文本；非文本 item（`reasoning`、`mcpToolCall`、`webSearch`、`fileChange`、`contextCompaction`）被有意跳过，因为 preview/detail 专注于对话文本

## 维护约束

- 这是 **adjunct client**，不是主 chat 路径。主路径仍通过 `@openai/codex-sdk` 的 `Codex` / `Thread` API。
- App-server 生命周期由 `CodexAdapter` 管理：`start()` 时初始化，`stop()` 时清理。
- App-server 启动是 best-effort：如果子进程 spawn 失败或 WebSocket 连接超时，`CodexAdapter` 会捕获异常并降级为仅使用 in-memory sessions。
- 协议生成的类型 (`AppServerThread`, `AppServerTurn`, `AppServerItem`) 基于本地 `codex app-server generate-ts` 输出，但在此文件中做了最小化内联以避免额外的生成步骤依赖。
- `AppServerItem`  union 已验证匹配真实 app-server 输出：包括 `userMessage`（含 `content[]` 文本数组）、`agentMessage`（含 `text` 字符串）、`reasoning`、`mcpToolCall`、`webSearch`、`fileChange`、`contextCompaction`。
- Checkpoint 15E 进一步确认：当前 Test Vault bundled `codex-cli 0.137.0` 使用该二进制自身 `codex app-server generate-ts --out /tmp/codex-app-server-01370-ts` 生成出的 `ClientRequest` **不包含** `account/usage/read` 变体。也就是说，`getAccountUsage()` 现在更像一个为未来 runtime surface 预留的 adjunct spike，而不是当前 shipped binary 已验证支持的稳定 seam。
- `account/usage/read` 的请求形状比 `account/rateLimits/read` 更严格：最小修补明确去掉了空 `params`，以匹配早期无参 JSON-RPC request 假设。即便如此，当前 Test Vault bundled runtime 仍返回 `JSON-RPC error -32600: Invalid request`，所以 15E 的 ordinary settings seam 已被重新收束为 `hidden`，而不是继续公开一个失败按钮。
- 不在这里实现 approval、model catalog、account readback 等更大的 app-server seam。
