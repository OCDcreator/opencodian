# CodexAdapter

> **源码**: `src/core/agents/backend/CodexAdapter.ts`
> **状态**: [RUNTIME_PROVEN]
> **Updated**: 2026-06-14 Checkpoint 15T — landed `invalidateLiveThread(sessionId)` live current-thread re-resume mechanism (drops cached SDK Thread so next turn re-resumes the same backendSessionId with updated CLI args, preserving conversation history)
> **Updated**: 2026-07-28 — an explicit missing CLI resolution or app-server `ENOENT` leaves the adapter in `error`; only non-binary app-server negotiation errors retain the SDK fallback.

> **新增（skills runtime truth）**: `getRuntimeSkills()` 通过 app-server `skills/list`（scoped to `workingDirectory`）返回 Codex 当前 vault 的 runtime skills，作为聊天 `/skills` 与 `$` 菜单的唯一 runtime 真相；app-server 不可用时返回 null。`forceNextRuntimeSkillsReload()` 设置一次性标志，使**下一次** `getRuntimeSkills()` 传 `forceReload: true` 绕过 app-server 缓存（用于插件自身的项目 skill 写入后，app-server 不一定发 `skills/changed`），随即清除标志；正常菜单打开保持缓存。`onSkillsChanged(handler)` 暴露 `skills/changed` 失效信号 Disposable；`start()` 时订阅、`stop()` 时取消订阅。聊天菜单缓存订阅此信号以立即失效，而非仅靠 120s TTL。

> **P1 grouped settings readback（2026-07-24）**: `getRuntimeSkillGroups()` 是 additive 设置页 seam，调用 `CodexAppServerClient.listSkillGroups({ cwd: workingDirectory })`，返回 cwd/source/errors 完整分组；app-server 不可用或调用抛错时返回 null。它不替换 `getRuntimeSkills()`，不参与聊天目录排序、去重或菜单结构。
> **Updated**: 2026-07-28 — CODEX_CAPABILITIES now declares AgentCapability.Models; the composer model selector is enabled for Codex.
> **新增（2026-07-30，会话 trace 生命周期）**: 构造函数新增可选 `tracePort?: CodexTracePort`（来自 `diagnostics/types.ts`，实现为 `CodexSessionTraceService`）。设置后 adapter 在会话与回合边界插桩 trace：`aliasSession()`（SDK 与 app-server 两条路径收敛 provisional local ID → 真实 threadId 时）调用 `tracePort.bindThread({ resumed })`；`beginTurn()` 调用 `port.beginTurn({ threadId, conversationId, tabId, model, diagnosticRunToken })` 并把返回的 `CodexTraceContext` 贯穿到订阅完成/异常/cancel 路径调用 `port.finishTurn(ctx, state, payload)`；`cancelStream` / `deleteSession` / response 失败分别以 `cancelled` / `incomplete` / `error` 终结活动 turn；app-server transport 构造时透传 `tracePort.wireBridge` 作为 `wireObserver`。所有插桩经私有 `trace(run)` helper：`tracePort` 为空或回调抛错都直接短路返回 `undefined`，绝不影响聊天主路径。`tracePort` 缺省（既有调用方）行为不变。

## 概述

`CodexAdapter.ts` 是 OpenAI Codex SDK 接入的 AgentService 适配器。它实现 `AgentChatCapability` 和 `AgentSessionCapability`，把 Codex SDK 的 `Codex` / `Thread` API 包装为统一的 agent 后端接口。

### 2026-07-22：app-server 主聊天与精确上下文

协议协商成功后，主聊天改由本机 `codex app-server` 的 `thread/start` / `thread/resume` / `turn/start` 承担；只有协商失败才使用 SDK 聊天回退。`thread/tokenUsage/updated` 是唯一的会话上下文权威来源：其累计 `totalTokens` 与 `modelContextWindow` 驱动 Context Ring，账号 `account/usage/read` 永不参与该 UI。adapter 将图片、sandbox、网络、web search、effort、JSON schema、审批、工具/文件/todo 通知映射回既有 `StreamChunk` 管道，并在取消时调用 `turn/interrupt`。每一轮也发出含真实 thread ID 的 `message_metadata`，使本地 provisional ID 能收敛为可恢复的后台会话 ID。

## 职责

- 实现 `AgentService` 核心：kind=`'codex'`、identity、status lifecycle、status change handlers
- 实现 `AgentChatCapability`：通过 `thread.runStreamed()` 提供异步流式聊天，经由 `CodexStreamNormalizer` 转换事件
- 实现 `AgentSessionCapability`：基于 provisional local ID + thread ID aliasing 的会话管理
- 提供 DI seam（`CodexFactory` 与 `CodexAppServerClientFactory`）：测试时可分别注入 mock SDK、mock app-server，或显式返回 `null` 验证协商失败后的 SDK 回退，无需真实 API key、网络或本机 Codex 状态库
- 接受 wiring 提供的 `CodexCliResolution`：missing 结果会在 SDK 构造前提供可操作错误；app-server spawn 的 `ENOENT` 也会清理部分状态并保持 `error`，不能显示为已连接
- 仅声明有 smoke-test 证据的能力：Chat、Sessions、Thinking、FileOps、Shell
- 使用 bundled `import('@openai/codex-sdk')` (esbuild 打包进 main.js)
- `sendMessage` 在 `resolveOrCreateThread` 阶段捕获异常并降级为 error chunk
- `updateModel()` 允许运行时更新模型名称，影响后续 thread 创建/恢复
- `updateAdditionalDirectories()` 允许运行时更新额外目录，影响后续 thread 创建/恢复
- `updateNetworkAccessEnabled()` 允许运行时更新网络访问开关，影响后续 thread 创建/恢复
- `updateWebSearchMode()` 允许运行时更新网页搜索模式（disabled/cached/live），影响后续 thread 创建/恢复
- `getRuntimeSkillGroups()` 为 Codex 设置区提供 cwd 分组、skill 来源和服务端 errors；聊天仍只消费 `getRuntimeSkills()` 的既有扁平目录
- `getHooksReadback()` 透传 Codex `hooks/list` 的只读 outcome；`empty`、`unavailable`、`failed` 与 `malformed` 保持可区分，不能用 `[]` 抹平失败或不可用
- `compactForegroundThread(sessionId, options?)` 是 Codex foreground compaction 的 backend seam：仅接受当前 adapter 映射的 app-server-owned thread，SDK/no-client、provisional/non-owned、active foreground turn 与 duplicate 各自返回 `unavailable`/`invalid-thread`/`busy`，绝不 fallback。空 ACK 只触发 `onAccepted` pending phase；只有请求后观察到同一非空 item ID 的 `contextCompaction item/started` 与随后 matching `item/completed`，再加新 `thread/tokenUsage/updated`，才返回 `runtimeVerified=true`；completion-only、mismatched/replayed item 绝不作为完成证据。它复用 `appServerContextSnapshots`/`getContextUsageSnapshot` 链，不建第二套 Context Ring 数据。独立通知订阅在 timeout/stop/delete 时 dispose，且 request-dispatch gate 丢弃订阅建立至 RPC 发送前的事件
- `getForegroundCompactionAvailability(sessionId)` 是无副作用同步 preflight，返回 `available|unavailable|invalid-thread|busy` 与可用时的真实 threadId；它与 dispatch 共用同一 private gate，不创建订阅、不发 RPC、不改变状态，供 UI 在点击前隐藏或禁用操作
- `CodexAppServerClient` 也负责 persisted session discovery；`listSessions()` 合并 in-memory 与 app-server threads，现在会同时请求 `thread/list archived=false` 与 `thread/list archived=true` 并合并，使 `BackendSessionBrowserModal` 能同时展示活跃与归档 threads；`getSessionMessages()` 通过 app-server 读取 thread turns 并归一化为 `{ role, content }` 形状供 `AgentBackendRouting` 消费；`getSession()` 优先 in-memory，回退 app-server；`stop()` 清理 app-server client。
- 实现 `AgentForkCapability`：`forkSession()` / `archiveSession()` / `unarchiveSession()` 通过 app-server `thread/fork`、`thread/archive`、`thread/unarchive` 操作 persisted threads
- **Server-request approval bridge** (Round 5): `setApprovalHost(host)` 注入 UI 回调；当 app-server client 可用且 host 提供 `collectApproval` 时，在 `start()` 后注册 `execCommandApproval` / `applyPatchApproval` 处理器。处理器把服务端 params 归一化为 `CodexApprovalRequest`（`kind`、`summary`、`command?`、`cwd?`、`changeCount?`、`raw`），交给 host 回调收集 `CodexApprovalDecision`（`approved` / `approved_for_session` / `denied` / `abort`），返回 `{ decision }` 由已落地的 bridge 基础设施回写为 JSON-RPC result。host 缺失/抛错/返回 null 时安全降级为 `denied`。`stop()` 注销处理器。导出类型：`CodexApprovalKind`、`CodexApprovalRequest`、`CodexApprovalDecision`、`CodexApprovalBridgeHost`
- **Approval policy（2026-07-24）**：`CodexAdapterOptions.approvalPolicy`（`CodexApprovalPolicy = 'inherit'|'untrusted'|'on-request'|'never'`，默认 `inherit`）。`buildAppServerThreadOptions`/`buildAppServerTurnOptions` 不再硬编码 `on-request`：`inherit` **省略** `approvalPolicy` 字段（后端用自身默认）；`untrusted`/`on-request`/`never` 透传到 app-server 选项。`sendMessage` 对 `untrusted`/`on-request` 做 **fail-closed**：当 `canUseAppServerChat()` 为假或未挂载 `collectApproval` 桥接时，直接 yield 可操作的 error chunk 并 return，**绝不**静默回退到 SDK 或 `never`。`never` 不要求桥接，app-server 不可用时可用 SDK 回退。`updateApprovalPolicy(policy)` 在下一 thread/turn 边界生效。
- **运行时证据捕获（2026-07-24）**：`getThreadEffectiveSettings(sessionId)` 返回 app-server `thread/start`/`thread/resume` 响应中**服务端确认**的有效设置（`AppServerThreadEffectiveSettings`：model/modelProvider/cwd/runtimeWorkspaceRoots/instructionSources/approvalPolicy/approvalsReviewer/sandbox/activePermissionProfile/reasoningEffort，全部可选）。防御式抽取：旧版 app-server 不回显时返回 null（`unavailable`，**非**请求侧值的伪回读）。仅 runtime 证据轴；persistence/application 轴另由配置闭环覆盖。
- **Attempt cancellation fence（2026-07-24）**：每次 app-server thread/turn 尝试在首次 await 前捕获不可变 options 与全局单调递增 epoch；所有 evidence/settings/context/alias/stream chunk 写入，以及 start/resume rejection、startTurn 返回和通知回调，都必须匹配当前 logical session 的 epoch。session key 统一归一到 provisionalId，真实 thread alias 共用同一 fence。`turn/completed` 在 `turn/start` 返回前会先暂存，待当前 turn ID 注册后只接受 ID 精确匹配的完成事件；同一 thread 的旧 completion 不能结束新流，也不能污染 evidence、context 或 chunks。`deleteSession`/`stop` 先失效 attempt、abort controller 并 interrupt active turn；旧 attempt 即使在 stop→restart 后才返回也不能 ABA 匹配或复活状态。delete 还同时清除 client effective-settings cache 与真实 context snapshot。

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
