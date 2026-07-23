# CodexAppServerClient

> **源码**: `src/core/agents/backend/CodexAppServerClient.ts`
> **状态**: [RUNTIME_ADJUNCT]
> **Updated**: 2026-06-14 — split wire types into `CodexAppServerClientTypes`, transport/lifecycle into `CodexAppServerTransport`, normalization helpers into `CodexAppServerClientNormalization`; `CodexAppServerClient extends CodexAppServerTransport` and re-exports types via `export *`

> **新增（skills）**: `listSkills({ cwd, forceReload? })` 调用 app-server `skills/list`，返回扁平 `AppServerSkill[]`（name/description/path/enabled/scope）。结果经导出的纯函数 `normalizeSkillsListResult` 归一：接受扁平数组、`{data}` 包装、单个/多个 `{cwd, skills, errors}` group envelope（真实服务器形态），丢弃无 `name` 的畸形项，**绝不伪造** skills。`subscribeToSkillsChanged(handler)` 包装 `skills/changed` 通知订阅，返回 unsubscribe 函数。

## 概述

`CodexAppServerClient` 是 Codex 本地 app-server 的类型化客户端。2026-07-22 起，实验 API 协商成功时它也是 Codex 的主 chat send/stream 路径；协商失败时 `CodexAdapter` 才保持 SDK 聊天回退且不挂载会话 Context Ring。

进程生命周期与 JSON-RPC plumbing 已拆入基类 `CodexAppServerTransport`；wire 类型拆入 `CodexAppServerClientTypes`（本文件通过 `export *` 重新导出）；transcript 归一化纯函数拆入 `CodexAppServerClientNormalization`（本文件保留向后兼容的静态 delegate）。本文件只保留类型化的 app-server API wrapper。

## 职责

- 通过 JSON-RPC 2.0 over WebSocket 与本地 `codex app-server` 通信
- `start()`: 启动 app-server 子进程 (`codex app-server --listen ws://127.0.0.1:0`)，从 stdout 和 stderr 扫描 WebSocket URL（Codex CLI 将 listening URL 输出到 stderr），连接并初始化 JSON-RPC 会话
- `stop()`: 关闭 WebSocket，终止子进程，清理 pending requests
- `listThreads(options?)`: 调用 `thread/list` 获取 persisted thread 列表。支持 `limit` 与 `archived` 过滤：`archived: true` 仅返回归档 threads，`archived: false` 仅返回非归档 threads；不传 `archived` 时由服务器默认返回非归档 threads
- `readThread(threadId, includeTurns)`: 调用 `thread/read` 获取单个 thread 的元数据和 turns
- `startThread(options)` / `resumeThread(threadId, options)`: 通过实验 API 新建或恢复主聊天 thread；当前模型、cwd、sandbox、审批和 web-search config 在此边界生效
- `startTurn(options)` / `interruptTurn(threadId, turnId)`: 启动/取消 app-server 回合；输出经异步通知到达，不能以 SDK 错误作为静默切换信号
- `subscribeToThreadNotifications(threadId, handler)`: 订阅并按 thread ID 隔离 `thread/tokenUsage/updated`、turn、item、warning/error 通知，支持并发 Codex 会话
- `listPermissionProfiles(options)`: 调用 `permissionProfile/list` 获取可用权限配置文件列表（Checkpoint 15C）；支持可选 `cwd`、`limit`、`cursor` 参数；返回 `AppServerPermissionProfile[]`（含 `id` 和可选 `description`）
- `getAccountRateLimits()`: 调用 `account/rateLimits/read` 获取账号速率限制信息（Checkpoint 15D / 15R）；返回 `AppServerAccountRateLimitsResult { rateLimits, errorReason? }`。环境相关（与 `account/usage/read` 相同）：ChatGPT 鉴权账号返回真实 `AppServerRateLimits`（含 `rateLimits` 和可选 `rateLimitsByLimitId`），API-key 鉴权返回 `chatgpt authentication required to read rate limits` 错误；`errorReason` 透传给 UI 以显示精确原因（含 `codex login` 提示），而不是笼统的 "unavailable"
- `getAccountRead()`: 调用 `account/read` 获取账号/认证信息（Round 3）；返回 app-server 响应（含 `account.type`、`account.email`、`account.planType`、`requiresOpenaiAuth` 等），错误或不可用时返回 `null`
- `listModels(options?)`: 调用 `model/list` 获取可用模型列表（Checkpoint 15B / Round 2）；返回 `AppServerModel[]`（含 `id`、`model`、`displayName`、可选 `description`、`defaultReasoningEffort`、`inputModalities`、`serviceTiers`、`upgradeInfo`）
- `listMcpServerStatus()`: 调用 `mcpServerStatus/list` 获取 MCP 服务器运行时状态（Checkpoint 15N）；返回 `AppServerMcpServerStatus[]`（含 `name`、可选 `serverInfo`、`tools`、`resources`、`resourceTemplates`、`authStatus`）；请求超时 30 秒以覆盖慢速 MCP 探测
- `reloadMcpServers()`: 调用 `config/mcpServer/reload` 请求 app-server 重新读取 MCP 配置；返回是否成功
- `mcpServerToolCall(threadId, server, tool, toolArguments)`: **16A 新增**。调用 `mcpServer/tool/call` 直接执行 MCP 工具调用。先 `thread/resume`（幂等）加载 thread，然后发送 `{ threadId, server, tool, arguments }`。返回 `AppServerMcpToolCallResult { content: [{ type, text }], isError, errorReason? }`。用于 inline retry 功能：当聊天中的 MCP 工具块失败时，用户可以重新执行完全相同的 server/tool/arguments 来验证修复
- `mcpServerOauthLogin(name, options?)`: 调用 `mcpServer/oauth/login` 触发 MCP 服务器 OAuth 流程，监听 `mcpServer/oauthLogin/completed` 通知确认完成；在 `finally` 中清理通知 handler 和超时 timer，避免 success/timeout/request-failure 任意路径泄漏 handler
- `addNotificationHandler(method, handler)` / `removeNotificationHandler(method, handler)`: 通用 JSON-RPC 通知订阅接口，用于 `mcpServer/oauthLogin/completed` 等异步事件
- `handleMessage()` 三路分发（Round 4）：(1) 普通响应（`id` 无 `method`）→ 解析 pending 请求；(2) 通知（`method` 无 `id`）→ notification handlers；(3) **服务端请求（`method` + `id`）**→ `handleServerRequest()`。此前服务端请求被误当响应并静默丢弃，现已修正
- `registerServerRequestHandler(method, handler)` / `unregisterServerRequestHandler(method)`（Round 4）：服务端发起 JSON-RPC 请求（带 `method`+`id`，如 `execCommandApproval` / `applyPatchApproval`）的处理器注册表。每个 method 至多一个 handler；handler 返回值作为 JSON-RPC `result` 回写（审批场景应返回 `{ decision: ReviewDecision }`）。无 handler 时回写 `-32601 Method not found`；handler 抛错/拒绝时回写 `-32603 Internal error`。**Round 5**：`CodexAdapter.setApprovalHost()` 现通过此注册表把 `execCommandApproval` / `applyPatchApproval` 接到 host 回调（adapter 层 wiring 已落地并有测试，UI 卡片集成 + 运行时触发证明仍待后续）
- 提供静态归一化方法 `normalizeThreadList()` 和 `normalizeTurnsToPreviewMessages()`，把 app-server 原始数据转换为 `AgentBackendRouting` 可消费的形状
  - `normalizeThreadList()` 现在保留 `archived` 布尔字段，使 `BackendSessionBrowserModal` 可以区分并渲染归档 threads
  - `normalizeTurnsToPreviewMessages()` 从 `userMessage.content[]`（提取 `type === 'text'` 的部分）和 `agentMessage.text` 中提取对话文本；非文本 item（`reasoning`、`mcpToolCall`、`webSearch`、`fileChange`、`contextCompaction`）被有意跳过，因为 preview/detail 专注于对话文本

## 维护约束

- 主聊天仅在 `initialize.capabilities.experimentalApi=true` 成功协商后使用该客户端；协商失败才回退 `@openai/codex-sdk`，并且回退模式不得展示估算为精确的 Codex 上下文百分比。
- App-server 生命周期由 `CodexAdapter` 管理：`start()` 时初始化，`stop()` 时清理。
- App-server 启动是 best-effort：如果子进程 spawn 失败或 WebSocket 连接超时，`CodexAdapter` 会捕获异常并降级为仅使用 in-memory sessions。
- 协议生成的类型 (`AppServerThread`, `AppServerTurn`, `AppServerItem`) 基于本地 `codex app-server generate-ts` 输出，但在此文件中做了最小化内联以避免额外的生成步骤依赖。
- `AppServerItem`  union 已验证匹配真实 app-server 输出：包括 `userMessage`（含 `content[]` 文本数组）、`agentMessage`（含 `text` 字符串）、`reasoning`、`mcpToolCall`、`webSearch`、`fileChange`、`contextCompaction`。
- Checkpoint 15E（基于 `codex-cli 0.137.0`）曾确认 generated `ClientRequest` 不包含 `account/usage/read` 变体；但 account/auth re-audit round 在 bundled `codex-cli 0.139.0` 上重新验证：该路由 **已存在**于 `ClientRequest` union，并且在 ChatGPT 鉴权账号下返回真实的 `summary`/`dailyUsageBuckets` payload（lifetimeTokens、peakDailyTokens、longestRunningTurnSec、currentStreakDays、longestStreakDays + daily buckets）。仅在 API-key 鉴权下返回 `chatgpt authentication required` 错误。
- `account/usage/read` 的请求形状比 `account/rateLimits/read` 更严格：最小修补明确去掉了空 `params`，以匹配无参 JSON-RPC request 假设。`getAccountUsage()` 现在返回 `AppServerAccountUsageResult`（`{ usage, errorReason? }`），把 app-server 的真实错误原因（例如 `chatgpt authentication required to read token usage`）透传给 UI，以便 readback 面板显示精确的 `codex login` 提示，而不是笼统的 "unavailable"。ordinary settings seam 已重新公开（不再 `hidden`），并按环境降级。
- Checkpoint 15R：`account/rateLimits/read` 共享相同的环境相关性（API-key 鉴权下返回 `chatgpt authentication required to read rate limits`）。`getAccountRateLimits()` 现在返回 `AppServerAccountRateLimitsResult`（`{ rateLimits, errorReason? }`），复刻 usage 的诚实降级模式，把精确原因透传给 readback UI。
- Checkpoint 15R 审批范围评估：0.139.0 app-server 通过 `ServerRequest` union（服务器发起、带 `method`+`id` 的 JSON-RPC 请求）投递审批回调（`execCommandApproval` / `applyPatchApproval` + v2 `item/*/requestApproval`）。**Round 4 已落地基础设施切片**：`handleMessage()` 现三路分发（响应 / 通知 / 服务端请求），新增 `registerServerRequestHandler` / `unregisterServerRequestHandler` 注册表 + JSON-RPC 回写路径（成功回 `result`，缺 handler 回 `-32601`，handler 抛错回 `-32603`）。**Round 5 已落地 adapter wiring**：`CodexAdapter.setApprovalHost()` 注册 `execCommandApproval` / `applyPatchApproval` handler → 归一化 params → host 回调 → `{ decision }` 回写（12 测试覆盖）。仍待后续：(1) view-host 把 host 回调接到现有 permission card / question UI；(2) 针对真正触发审批的 permission profile 跑运行时验证
- 不在这里实现 approval、model catalog、account readback 等更大的 app-server seam。
