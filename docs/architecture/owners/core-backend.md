# Owner: core.backend

2026-10-29：ZCodeModelSurface 继续拥有目录生命周期，补无会话工作区目录加载（deferred 草稿、原生读回、条件关闭、并发去重及 transport 隔离）；adapter 仅暴露工作区 models/default seam，不建立第二个聊天会话 owner。

2026-10-29：原生 mention 目录与发送校验仍归来源适配器所有：Codex 使用有效安装目录与结构化输入，ZCode 使用当前 workspace/session 目录；DSH 仅在 resolver 与两端 Vault 身份已验证时返回原生引用。Codex/ZCode 提供只读引用历史入口，失败返回 unavailable，由 feature 层使用有来源标记的快照回退，不启动来源模型回合。

2026-10-27：OpenCode 2 配置覆盖验证支持 JSONC 注释和尾逗号；解析失败在修改设置/启动服务前返回。原生读回、活动 turn 保护、远程只读和失败恢复仍归适配器持有，设置 UI 不绕过该边界。
> 2026-10-24：DSH 默认由 DshNativeClient 承载原生运行时扩展，ACP 为兼容选项。原生历史/分叉/命令/问题/MCP 和辅助 LLM 归本 owner；DshAuxQuerySession 校验无 Agent/工具调度/持久化的安全边界，DshQuestionBridge 拥有问题结算。私有 profile 接收启动器写入，用户 SDK 配置只读；assets/dsh 仅为嵌入式插件源码。新增模块分别映射同名模块文档，未新增服务 owner 或 feature 依赖。
> 2026-10-13（矩阵接力 018）：CodexAppServerTransport.handleMessage 增加非对象帧防护——JSON null/标量/数组帧路由到既有 Unrecognized 告警路径，不再于 `msg.id` 解引用处抛未捕获异常击穿 ws.onmessage；语义对齐 ZCode 解析器的 isPlainObject 加固。修复经 owned loopback WebSocket 实机复测（修复前 null 帧致命、修复后零异常且连接保持），回归用例与全量 verify 落 main。
> 2026-10-07：ZCode 辅助存储所有权包含独立的 native `sessionDbPath`；每个 scope 同时覆盖 `ZCODE_SESSION_DB_PATH` 和 `ZCODE_SESSION_DB`，以及 `ZCODE_STORAGE_DIR`。仅请求 storage 根不能证明数据库隔离。
> 2026-10-07：ClaudeCodeScopedSessionStore 隔离原生 transcript IO，复用到 SDK 静态目录、消息、分支、重命名和导入；query 仍经原 SDK/CLI 路径写入指定 config 根。不得用宿主 env 临时改写或绕过 resume identity 校验解决目录不一致。
> 2026-10-06：Codex SDK fallback 每轮以独立选项快照恢复同 native thread，应用 UI 模型/effort 覆盖并保留严格权限 gate；SDK 非致命 ErrorItem 只作诊断事件，fatal thread/turn 仍为 error。边界与 canonical state 未扩展。
> 2026-10-02（reviewed continuation，用户已授权）：ClaudeCodeAdapter 的 MCP permission override 与 output-style reload 复用现有 active persistent query，以 native session ID 选择目标；缺方法/失效会话返回 unavailable，响应/会话竞态失败不提升为 runtime verified。SDK 回执仅 acknowledged，刷新样式列表不代表选中样式或新模型输出；配置三轴与 UI 验收另记。Codex 删除默认须同 ID absence 回读 verified；pending/failed/admitted 期间 deleted 通知不得擦掉恢复身份、alias 和 evidence/cache，同 ID retry 可通过权威 absence 收敛。显式 forgetSession 不发 native delete/archive，UI 暴露另记 partial；backend owner 保留这些状态所有权。
> 2026-10-02（接入修复 T05/T08）：Codex catalog 由现有 client 保留分页 cursor、跨页去重和 partial failure；native mutation admission 与 failed/unavailable 分开，adapter 失败保留恢复身份，显式 local forget 不分派 native delete。ACK 不作为终态/readback 证明。Claude 新 control 的 SDK 类型契约与 adapter 业务接线分别验收；实施记录列明图门禁及尚未执行的 runtime/UI 场景，不能仅因 SDK 方法存在宣称能力完整。
> 2026-09-30 (Codex 0.159 app-server integration)：
> - 新 client 路由：turn/steer、thread/items|turns 列表分页、thread/name/set、thread/delete、thread/attachment/*、account/usage/read、plugin/*；transport WS 重连带 backoff + `onReconnect`/`onReconnectFailed`。
> - CodexAdapter：`steerTurn`（TurnSteering 仅在 app-server 路径声明）、会话 title/delete、goal pause/resume、approval v2（`item/*/requestApproval`）+ `item/tool/requestUserInput` 桥接、重连集成、plugin/usage 透传方法（`readAccountUsage`、`listCodexPlugins`、`listInstalledCodexPlugins`、`installCodexPlugin`、`uninstallCodexPlugin`、`reconcileCodexPlugins`）、`getSessionTurnsPage`/`getSessionTurnItemsPage`。
> - 新增 `CodexElicitationBridge.ts`（`mcpServer/elicitation/request`，form/url 模式，http(s) allowlist）；`AppServerToolUserInputResponse` 类型化为按 question id 键控的 `Record`。
> - `OpenCodeAdapter` legacy 能力集如实排除 TurnSteering（`OPENCODE_LEGACY_CAPABILITIES`）；`BackendCapabilitySets.test.ts` 锁定五个后端的能力集；`ClaudeCodeAdapter` 仅注释更新。
> 2026-09-27（跨平台修复）：ZCode 路径解析按目标平台语义拼接——`getPathApi`/`discoverZCodeProviderConfig` 非 win32 回退改 `path.posix`，`resolveZCodeDataRoot` 新增可选 `platform`；真实宿主行为零变化，修复 Windows 宿主上模拟 darwin/Linux 布局被 win32 化导致的 CI 16 用例失败。
> 2026-09-25 (FA880): ZCode native background jobs are read from `session/read` and canceled only by an exact sessionId/taskId pair with terminal readback.
> 2026-09-25 (FA880 ZCode): Native `session/events` mode transitions expose `planEnabled` separately from the `session/read` base mode; ZCodeAdapter confirms Plan only with matching same-session event readback. ZCodeInteractionBridge denies pure permission asks after 60 seconds and rejects late approvals.
> 2026-09-24 (票 09)：兼容加固落地——协议版本协商证据入诊断、诊断文本统一脱敏上限、重启覆盖（首个 transport 释放 + 新握手无孤儿）。
> 2026-09-24 (票 08)：ZCode aux/inline 裁决为证据支撑的 fail-closed 不可用（无运行时只读机制——工具清单含 write/shell/subagent、setMode 无效、无白名单通道），拒绝于启动、不开会话、不降级。
> 2026-09-22（核查修复）：ZCode 启动路径两处阻断修复——node-bundle 运行器弃用宿主 Electron（改 bundle 应用 Electron → node）；provider 配置改官方成对 env 注入（BUILTIN+PERSONAL 同时提供），设置覆盖优先于环境命令覆盖。
> 2026-09-24 (票 07)：图片附件诚实裁决——本地校验 + 协议面不可用（实测证据），零 dispatch；路由恢复保留记录级 attachments。
> 2026-09-24 (票 06)：ZCode 实时模型/思考/模式/斜杠目录落地（快照+广播双通道）；setModel/setThoughtLevel/setMode 发送前校验；会话覆盖与持久化默认分处回合/物化两边界。
> 2026-09-24 (票 05)：ZCodeStreamMapper 接通工具调用（tool_use/result/progress，streaming input 与 duration 双证据）、后台任务跟踪（稳定 taskId，不覆盖前景）、context_usage 仅原生证据（成本恒 null）；子代理链路经 `getSessionSubagents` 直通。
> 2026-09-22 (票 04)：ZCode 交互环落地——原生 permission/userInput ask ↔ 既有权限/问答面（严格应答 schema：JL / action-content；恰一次；未知形状与过期应答 fail-closed；teardown 落定）。
> 2026-09-22 (票 03)：ZCodeAdapter 接通原生生命周期（list/read/messages/fork/compact + resume 激活语义），AgentBackendRouting 的消息归一增加 zcode 信封兼容；rename 与 delete 均为证据支撑的诚实不可用（方法表无 rename/delete；实证 `session/close` 仅句柄分离——历史可回读、行保留）。
> 2026-09-22（二轮核查修复）：ZCode provider 发现的计数改正式 schema（未知→null 不伪造），builtin 读取/解析失败分型（unreadable/malformed）。
> 2026-09-22 (ZCode 票 02)：ZCodeAdapter 接通聊天/会话能力——`session/event` → ZCodeStreamMapper → StreamChunk（seq 去重、delta 通道互斥、终结/用量/失败归一）；`session/send|stop|create|subscribe` 走自有 transport；会话物化时对宿主 ask（runtime preferences / MCP auth headers）做诚实应答防死锁。并发 per-session 流与取消语义保持后端中立契约。
> 2026-09-22 (ZCode 票 01)：`src/core/agents/backend/zcode/**` 新增 ZCode 独立 adapter/transport 边界——官方 `app-server --stdio` NDJSON 协议（无 `jsonrpc` 字段）、边界校验与未知事件诚实降级、fail-closed 服务端请求应答；进程所有权收口于 ZCodeAppServerTransport（只杀自有进程，SIGTERM→SIGKILL，无孤儿）；provider 配置只读发现并经 env 注入，绝不改写用户配置。
> 2026-09-21 (advantage-parity R-F7)：R-F7 域 env 注入缝：ClaudeCodeOptionsBuilder `domainEnv`（legacy settings.env 仍最终覆盖）+ ClaudeCodeAdapter live accessor；CodexAdapter `getExtraEnv`（SDK 构造 + app-server transport）；AgentAdapterWiring 透传 codex/pi 缝。
> 2026-09-21 (advantage-parity R-F1)：AgentService 新增 AgentTurnSteeringCapability 接口（steerTurn——注入活动轮，不新起会话）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): OpenCodeAdapter/ClaudeCodeAdapter/CodexAdapter/PiAdapter consumed the new memory-injection seam (opencode: synthetic text part; claude/codex/pi: prompt prefix).
- 2026-09-18 (R-C3): `AgentInlineCompletionCapability` + the shared `WarmInlineCompletionSession` wrapper land next to the aux contract; all four adapters expose `startInlineCompletionSession()` built from their existing audited read-only session construction (fail-closed proofs and `AuxQuerySafetyProof` reused verbatim). The wrapper adds warm lifecycle only (turn serialization, reset-through-recreate, `ClaudeCodeAuxQuerySession.warmUp()` eager CLI start); it cannot widen what a session may do.
- 2026-09-18 (inline-edit R-A3/R-A4): the auxiliary sessions (ClaudeCode/Codex/OpenCode) gained per-turn image attachments reusing the chat-side wire shapes (Anthropic base64 block via `createUserPrompt`; Codex `localImage` with temp files in the system temp dir, cleaned per-turn and on dispose) and progressive text streaming (Claude `includePartialMessages` text_delta only; Codex native per-token deltas). Read-only contract, deny-list, and audit semantics unchanged; images never enter the vault.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/agents/backend/**`

## Responsibilities
- agent backend adapters and transports for OpenCode, Codex and Claude
- Claude settings source, project resource secure write, configuration archive
- backend model catalog and routing

## Canonical state (truth home)
- agent service registry instances
- Claude/Codex/OpenCode adapter state
- backend model catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/backend/index.ts`
- `src/core/agents/backend/claude/ClaudeCodeAdapter.ts`
- `src/core/agents/backend/codex/CodexAdapter.ts`
- `src/core/agents/backend/opencode/OpenCodeAdapter.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.agents`, `core.backend-diagnostics`, `feature.chat-send`
- **Delegates to:** `core.backend-diagnostics`

## Focused tests
- `tests/unit/core/agents/backend/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Codex app-server form/tool-input handlers validate the entire raw shape before host/card admission; malformed or unsupported properties/options receive a local decline/cancel or empty answers response. Preserve known empty/schema-less form fallback, declared optional null tool options, native question IDs/order, answer copies and request/turn lifetime disposal. `items.anyOf` const/title options follow existing oneOf/enum/items.enum precedence without filtering invalid entries. Synthetic handler bodies are not RPC-envelope/native/provider continuation evidence.
- ZCode user-input normalization requires non-empty normalized option labels and unique question text before card/pending registration; invalid options or duplicate text reject the entire request. Source fixture evidence does not prove native/UI acceptance.
- Archive history descriptor identity preserves exact filesystem device/inode IDs using bigint stats and decimal-string tokens; Windows NTFS IDs must never be rounded through JavaScript Number. Confinement, state and content integrity checks remain mandatory before restore.
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade notes
- 2026-09-02: `@anthropic-ai/claude-agent-sdk` upgraded `0.3.145 → 0.3.252`. `Query.interrupt()` now resolves to `SDKControlInterruptResponse | undefined` (interrupt receipt on `interrupt_receipt_v1`-capable CLIs); `ClaudeCodeSessionRuntime.query.interrupt` was widened to `() => Promise<unknown>` since OpenCodian discards the receipt. `SDKControlGetContextUsageResponse` kept `model` / `totalTokens` / `maxTokens` unchanged (new `agents` / `slashCommands` / `skills` fields are additive), so `getSessionContextUsageSnapshot()` normalization needed no adaptation.
- 2026-09-02 能力接入：`conversation_reset` → sdkSessionId 重映射（captureSdkSessionId 跳过 reset 消息防误抛）；`commands_changed` → `onCommandsChanged` 订阅 surface；`onUserDialog`/`supportedDialogKinds` options 透传；Codex app-server `cache_write_input_tokens` → snapshot.cacheWriteTokens。
- 2026-09-08：三后端 SDK 刷新到 Claude 0.3.263、Codex 0.153.4、OpenCode 1.18.29。`core.backend` 负责 Claude 稳定系统信号的类型化兼容边界、permission prompt 所有权、Codex 新 effort/thread source 与 OpenCode provider timeout 类型兼容；实验性 usage 与无宿主控件的能力不得伪装为已支持。
- 2026-09-28：三后端 SDK 刷新到 Claude 0.3.283、Codex 0.158.0、OpenCode 1.18.33（`@opencode/client` 维持 2.0.18，上游仍为最新 tag）。删除面审计：Codex/OpenCode 导出面纯增量零删除；Claude 删除项（`TaskOutputInput`/`REPLInput`/`REPLOutput` Monitor 输入重构、`onSetMaxThinkingTokens` 加宽新增 `'highlights'`、doc-only 注释）在插件中零引用。唯一行为适配：SDK ≥ 0.3.267 默认记录系统提示并在后续请求原样复用（append 变更被忽略至压缩），`ClaudeCodeOptionsBuilder` 在带 append 时显式 `snapshot: false` 保持用户设置中途修改下一轮生效的既有语义；aux 单发查询（裸字符串 + `persistSession: false`）不受影响无需适配。新版 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 运行时告警只让既有 allowedTools 自动批准语义可见化，不改变插件行为。合入前以真模型补强验收：Claude 同会话切换矩阵四路径全过（含对照组证明默认路径确会冻结）、Codex 流式+同线程回忆、OpenCode 本机 CLI 对齐 1.18.33 后流式+同会话回忆全过；ZCode/Pi 无 npm SDK，运行时版本分别跟随 ZCode 桌面应用（3.14.3，glm bundle 实测握手正常）与外部 pi CLI。

## Pi service delegation (2026-09-08)

Pi runtime is delegated to [core.backend-pi](core-backend-pi.md). This owner retains the common registry/contracts and existing OpenCode/Claude/Codex implementations; Pi runtime responsibilities do not accumulate here.

- 2026-09-15: 新增 `AgentAuxQueryCapability` 与三个 aux 会话实现（`auxiliary/OpenCodeAuxScope.ts`、`auxiliary/OpenCodeAuxQuerySession.ts`、`auxiliary/ClaudeCodeAuxQuerySession.ts`、`auxiliary/CodexAuxQuerySession.ts`）。OpenCode/Claude/Codex 三个 adapter 各自实现 `startAuxQuerySession()`，全部 fail closed；`AppServerThreadStartOptions` 增加 `ephemeral`。

## 2026-09-27 OpenCode 2 compatibility

OpenCode2Adapter owns the separate OpenCode 2 CLI/client protocol, session lifecycle, event mapping, and native approvals/forms.

## 2026-10-05 Codex 消息前分支与恢复

合并复核：Codex 单次发送的 user item 身份在 terminal 时只发布唯一候选，同 turn steering 歧义不写入本地消息；fork child 目录引用由既有 verified 删除、explicit forget 和外部删除清理路径管理，pending 删除不清理。所有状态仍由现有 adapter owner 持有。

Codex `willRetry` 保持非终止，单条已完成 assistant 以 native item/turn/text 收敛；工具、多 assistant 和未知成功状态不提供单条快照。

Codex user item/owning-turn identity、attempt fencing、权威 beforeTurnId 映射、保守 native 协议版本守卫、目录缺失引用的同 ID 权威读取和逐发送模型快照留在既有 Codex adapter/client/normalizer owner。其他后端、SDK fallback、auxiliary 和公共架构边界不变。

## 2026-10-05 Claude external executable lifecycle

ClaudeCodeAdapter owns current CLI resolution for new/resumed queries and dedicated probes. It revalidates after asynchronous SDK/MCP loading, preserves injected SDK/path/env/shell ownership, and snapshots each spawn callback. Executable edits do not close persistent queries. Explicit restart validates first and closes only after a valid selection; next send keeps native identity/history while adopting the current executable. No other backend behavior changes.

2026-10-06：ZCodeManagementService 保存证据的 runtime 值继续限定为原生 effective catalog；application 在保存时保持 pending。会话新建/重连恢复及插件执行的独立观察不由 secure writer 推断，不新增状态所有者或绕过 revision/archive/fail-closed。

2026-10-07：ZCode generic aux 的只读边界包含独立 HOME/workspace/config 和创建前原生插件禁用回读；工具表不能约束 hook 子进程。消息 fork 使用当前 Protocol 1 的 target discriminated union，原生失败继续向上传递。

ZCode state.updated 的单项 current-model projection 与 session/read 使用同一 catalog 合并边界；native process exit 清除当前 transport 的 startPromise，保持新握手与迟到退出的身份隔离。

ZCode interaction state follows exact native `permission.resolved` identities, including native question auto-continue; pending reads cannot retain answerable expired cards.

OpenCode 2 auxiliary scopes own all HOME/XDG/DB/temp roots, and native permission normalization may only narrow the verified wildcard deny.

2026-10-07: Session catalog evidence is owned by AgentBackendRouting; OpenCode 2 emits bounded partial read errors with admitted records/cursor, never synthetic session IDs.

2026-10-07：目录失败 DTO/Error/classifier 由 shared.foundation 承载；AgentBackendRouting 兼容 re-export，OpenCode2Adapter 直接引用同一构造器，保持浏览器 partial 行为。

2026-10-07：OpenCodeAuxScope readiness 单次请求有界且可取消，防止挂起 /config 绕过 60 秒启动上界。失败时 teardown，不进入未验证 native aux session。


## 2026-10-08 Codex compatibility and failed negotiation cleanup

Failed app-server negotiation stops the owned client before SDK fallback. Before-turn fork keeps the native 0.160+ contract and admits only the separately verified 0.158.0 alternative: authoritative inactive source/target, inclusive lastTurnId prefix or revert of the newly created child, exact child lineage and prefix readback. Unsafe/missing readback or failed revert cannot become fork success; the parent is never reverted. Unknown and other older versions remain unavailable.


Codex CLI account/model fallback reads snapshot the current provider-domain environment, including CODEX_HOME, for each execFile call without mutating the renderer process environment. The bounded output/timeout and native-first behavior stay intact.


## 2026-10-08 Codex auxiliary cancellation

Timeout, request abort, explicit cancel and dispose settle locally within the original budget and interrupt the exact admitted native turn once. A late turn/start acknowledgement after local cancellation is interrupted using its captured owned thread/turn ID, so it cannot survive the cancelled request. Pre-aborted requests send no native turn. Failed/interrupted native terminals cannot admit partial replacement text. Read-only sandbox, no network, never approvals and ephemeral readback remain required.

The plugin composition supplies Pi extension-command completion localization through the existing adapter wiring callback, keeping the Pi service boundary independent of the locale runtime.

Claude message-before fork resolves the predecessor native chain UUID before using the SDK inclusive boundary and refuses an unavailable empty prefix. Inline input refresh preserves the current draft in input phase, including delayed catalog loads, without changing generating/new-round clear behavior.


## 2026-10-13 Claude elicitation schema admission

ClaudeCodeElicitationBridge 的既有 builder 拥有 raw schema/properties/property 形状与支持类型的建卡前检查。畸形或未知字段类型抛出固定安全拒绝错误，由 app.composition 的既有 handler 转成 decline/cancel；不引入 nullable 传播或新 runtime owner。SettingsCapabilityLab 的合法 synthetic wiring probe 保持只读。此项 source/mock 证据不晋升 native/UI/profile 矩阵。


## 2026-10-21 Codex elicitation host-wiring race

CodexAdapter 的 `mcpServer/elicitation/request` 路由注册不再以 elicitation host 已接线为前提：app-server client 可用即注册（消除帧先到、host 后接线时落入 transport -32601 的窗口）。host 缺失到达的合法帧进入 adapter 内 `pendingElicitations` 挂起，绑定该请求的 request/turn AbortSignal 与 60 秒上界（对齐 turn watchdog）；abort、超时与 adapter stop 均按既有 cancel 语义 settle，绝不悬挂或伪造回答。`setElicitationHost` 接线后立即按原始 wire params 派发挂起帧，combined signal 在派发期间保持武装。挂起/派发簿记属于既有 core.backend owner（CodexAdapter 内部），不新增 runtime owner，不改变 approval 桥注册条件与 CodexElicitationBridge 的纯 helper 边界；回归见 `CodexElicitationBridge.test.ts` host-wiring race 组。


## 2026-10-21 OpenCode 1 backend retirement

`IMPLEMENTED_AGENT_BACKENDS` 摘除 `opencode`：设置归一化与 UI 过滤不再暴露 OpenCode 1，`main.ts` 不再注册 `OpenCodeAdapter`，`AgentServiceRegistry.pickDefaultActive()` 默认偏好改为 `opencode2`。`OpenCodeAdapter` 与 `src/core/opencode/**` 代码保留（休眠，供存量会话、legacy 只读引用与回滚）；存量 `opencode` conversation owner 不改写，routing 视为不可用后端。设置默认后端与存量迁移归 core.types 的 settingsLoadNormalization 所有（`migrateRetiredBackendKind()`）。

## 2026-10-23 DSH ACP backend

`DshAdapter` 与私有 `dsh/DshAcpClient` 在本 owner 内拥有本地 DeepSeek Harness 的 ACP 子进程、握手、请求关联、会话恢复、逐会话取消及权限回复。注册层只注入设置/环境，聊天视图只转发权限。能力仅声明 Chat、Sessions、Permissions、Thinking；不把 `session/close` 当成删除历史，不复用休眠的 OpenCode 1 服务，也不连接桌面私有 Web host。

## 目录定位（2026-10-23）

当前源码目录：`src/core/agents/backend`、`src/core/agents/backend/auxiliary`、`src/core/agents/backend/claude`、`src/core/agents/backend/codex`、`src/core/agents/backend/configuration`、`src/core/agents/backend/dsh`、`src/core/agents/backend/opencode`、`src/core/agents/backend/zcode`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

## 2026-10-24 DSH ACP 扩展

DshAdapter 在既有 owner 内维护逐会话配置、原生目录/推理选择和 aggregate usage；DshProtocolCodec 集中隔离 MCP 进程/HTTP 声明准入、握手与多模态内容编码。无新的服务 owner，未使用桌面私有 Web host。图片声明遵循当前握手；aux/inline 不以提示词限制替代运行时只读证明。配置 timeout、旧生成器收尾和 dispose 均维护自有 client/turn 归属。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `core.backend` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## 2026-10-30 会话标题

六后端原生标题读取保留来源；Codex 活跃条目读取 name；OpenCode 2 生成接口透传取消。标题生命周期仍属于 feature.chat-services。

## 会话信息（2026-10-31）

AgentService 的会话信息契约及各 adapter 拥有只读运行时投影；账户额度、会话累计与上下文窗口分开，子会话必须使用原生身份。
