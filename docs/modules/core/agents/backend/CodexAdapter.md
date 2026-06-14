# CodexAdapter

> **源码**: `src/core/agents/backend/CodexAdapter.ts`
> **状态**: [RUNTIME_PROVEN]
> **Updated**: 2026-06-14 Checkpoint 15T — landed `invalidateLiveThread(sessionId)` live current-thread re-resume mechanism (drops cached SDK Thread so next turn re-resumes the same backendSessionId with updated CLI args, preserving conversation history)

## 概述

`CodexAdapter.ts` 是 OpenAI Codex SDK 接入的 AgentService 适配器。它实现 `AgentChatCapability` 和 `AgentSessionCapability`，把 Codex SDK 的 `Codex` / `Thread` API 包装为统一的 agent 后端接口。

## 职责

- 实现 `AgentService` 核心：kind=`'codex'`、identity、status lifecycle、status change handlers
- 实现 `AgentChatCapability`：通过 `thread.runStreamed()` 提供异步流式聊天，经由 `CodexStreamNormalizer` 转换事件
- 实现 `AgentSessionCapability`：基于 provisional local ID + thread ID aliasing 的会话管理
- 提供 DI seam (`CodexFactory`)：测试时注入 mock Codex 实例，无需真实 API key 或网络
- 仅声明有 smoke-test 证据的能力：Chat、Sessions、Thinking、FileOps、Shell
- 使用 bundled `import('@openai/codex-sdk')` (esbuild 打包进 main.js)
- `sendMessage` 在 `resolveOrCreateThread` 阶段捕获异常并降级为 error chunk
- `updateModel()` 允许运行时更新模型名称，影响后续 thread 创建/恢复
- `updateAdditionalDirectories()` 允许运行时更新额外目录，影响后续 thread 创建/恢复
- `updateNetworkAccessEnabled()` 允许运行时更新网络访问开关，影响后续 thread 创建/恢复
- `updateWebSearchMode()` 允许运行时更新网页搜索模式（disabled/cached/live），影响后续 thread 创建/恢复
- **App-server adjunct client** (Checkpoint 14H): `start()` 初始化 `CodexAppServerClient` 用于 persisted session discovery；`listSessions()` 合并 in-memory 与 app-server threads，现在会同时请求 `thread/list archived=false` 与 `thread/list archived=true` 并合并，使 `BackendSessionBrowserModal` 能同时展示活跃与归档 threads；`getSessionMessages()` 通过 app-server 读取 thread turns 并归一化为 `{ role, content }` 形状供 `AgentBackendRouting` 消费；`getSession()` 优先 in-memory，回退 app-server；`stop()` 清理 app-server client。App-server 为 best-effort：启动失败时自动降级为仅 in-memory sessions，不影响主 SDK chat path。
- 实现 `AgentForkCapability`：`forkSession()` / `archiveSession()` / `unarchiveSession()` 通过 app-server `thread/fork`、`thread/archive`、`thread/unarchive` 操作 persisted threads
- **Server-request approval bridge** (Round 5): `setApprovalHost(host)` 注入 UI 回调；当 app-server client 可用且 host 提供 `collectApproval` 时，在 `start()` 后注册 `execCommandApproval` / `applyPatchApproval` 处理器。处理器把服务端 params 归一化为 `CodexApprovalRequest`（`kind`、`summary`、`command?`、`cwd?`、`changeCount?`、`raw`），交给 host 回调收集 `CodexApprovalDecision`（`approved` / `approved_for_session` / `denied` / `abort`），返回 `{ decision }` 由已落地的 bridge 基础设施回写为 JSON-RPC result。host 缺失/抛错/返回 null 时安全降级为 `denied`。`stop()` 注销处理器。导出类型：`CodexApprovalKind`、`CodexApprovalRequest`、`CodexApprovalDecision`、`CodexApprovalBridgeHost`

## 维护约束

- 隐藏阶段已结束：`'codex'` 已加入 `IMPLEMENTED_AGENT_BACKENDS`，在 UI 暴露为用户可选后端
- `codexPathOverride` 必须在 wiring 阶段通过 `resolveCodexBinaryPath()` 解析并传入，因为 Obsidian 插件 `__filename` 不指向插件目录，SDK 的 `require.resolve` 链会失败
- `skipGitRepoCheck: true` 在 `buildThreadOptions()` 中无条件设置：Obsidian vault 通常不是 Git 仓库。所有 `resumeThread()` 调用（包括 unknown-threadId fallback）均通过 `buildThreadOptions()`，确保非 Git vault 恢复不会失败
- `updateSessionTitle` 是 no-op：Codex SDK 不暴露 title 管理
- `deleteSession` 仅清理本地映射：Codex SDK 不提供显式删除 API
- 新增 Codex 专有能力前必须有 SDK smoke 证据和对应测试
- Session aliasing 使用 provisionalId → threadId 双向映射，避免首次 turn 前 `thread.id === null` 时找不到 session
- `resolveOrCreateThread` 区分 provisional ID（`codex-local-` 前缀）和真实 thread ID：前者走 `startThread()`，后者走 `resumeThread()`
- 认证不预检：Codex CLI 支持多种认证来源（显式 apiKey、`OPENAI_API_KEY` env、`~/.codex/auth.json` ChatGPT login 等），adapter 不在初始化阶段拦截；认证失败在 `thread.runStreamed()` 运行时自然暴露
- `updateModelReasoningEffort()` 更新 options 引用但不影响已创建的 thread；chat toolbar effort selector 通过此方法在"下一 thread"边界生效
- **`invalidateLiveThread(sessionId)`** (Checkpoint 15T): 丢弃某 session 缓存的 SDK `Thread`（保留真实 `threadId`），使下一次 `sendMessage()` 通过 `resolveOrCreateThread` 走 `codex.resumeThread(threadId, buildThreadOptions())` 重新恢复同一 backend thread，使用最新的 options。这是把会话设置从"下一 thread 边界"推进到"当前会话下一 turn 即时生效"的诚实机制。SDK 在 `startThread()`/`resumeThread()` 时冻结 `_threadOptions`（`index.js:56`），每轮 `runStreamed()` spawn 独立的 `codex exec resume` 子进程从 CLI args 读取设置；不 invalidate 则缓存的 thread 继续用旧 args。该方法不使用 app-server `thread/settings/update`（该路由 `blocked` 且只改 app-server 内存态，无法触达 SDK 每轮子进程）。对 mid-stream 调用安全：运行中的 turn 已局部捕获 `Thread` 引用，只有下一 turn 会重新恢复。provisional-only / 无 threadId / 无缓存 thread 时返回 false。由 `ConversationSessionSettingsCoordinator.applyConversationRuntimeState()` 在 `applyCodexRuntimeOverrides` 之后对有真实 `backendSessionId` 的 Codex 会话调用。
- `getModelList()` 优先通过 `CodexAppServerClient.listModels()` 读取 app-server `model/list`，回退到 `codex debug models` CLI 诊断；返回 `CodexModelSummary[] | null`
- `getAccountInfo()` 优先通过 `CodexAppServerClient.getAccountRead()` 读取 app-server `account/read`，回退到 `codex doctor --json` CLI 诊断；返回账号/认证信息
- `getAccountUsage()` 通过 app-server `account/usage/read` 返回 `AppServerAccountUsageResult { usage, errorReason? }`。环境相关：ChatGPT 鉴权账号返回真实 token 使用量（summary + dailyUsageBuckets），API-key 鉴权返回 `chatgpt authentication required` 错误；`errorReason` 透传给 UI 以显示精确原因（含 `codex login` 提示）。
- `getAccountRateLimits()` 通过 app-server `account/rateLimits/read` 返回 `AppServerAccountRateLimitsResult { rateLimits, errorReason? }`（Checkpoint 15R）。共享与 usage 相同的环境相关性：ChatGPT 鉴权账号返回真实速率限制，API-key 鉴权返回 `chatgpt authentication required to read rate limits`；`errorReason` 复刻 usage 的诚实降级模式透传给 UI。
- `updateModel()` 接收模型字符串，空字符串会清除为 SDK 默认，仅对后续新建/恢复的 thread 生效
- Approval bridge 维护约束（Round 5）：仅 wire 了 `execCommandApproval` / `applyPatchApproval` 两种最窄的审批形状，不覆盖 v2 `item/*/requestApproval` 变体或 `mcpServer/elicitation/request`；`CodexApprovalDecision.decision` 仅支持四个标量值，`ReviewDecision` 的对象变体（`approved_execpolicy_amendment` / `network_policy_amendment`）超出本切片范围；host 回调在调用时动态读取 `this.approvalHost.collectApproval`，因此 `setApprovalHost({})` 后已注册的 handler 会安全降级为 `denied`；运行时审批触发证明仍待有效 auth 恢复后针对真正触发审批的 permission profile 验证（当前分类：wiring tested，runtime unproven）
