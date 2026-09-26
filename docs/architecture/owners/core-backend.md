# Owner: core.backend
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
- `src/core/agents/backend/ClaudeCodeAdapter.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/core/agents/backend/OpenCodeAdapter.ts`

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
- Archive history descriptor identity preserves exact filesystem device/inode IDs using bigint stats and decimal-string tokens; Windows NTFS IDs must never be rounded through JavaScript Number. Confinement, state and content integrity checks remain mandatory before restore.
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade notes
- 2026-09-02: `@anthropic-ai/claude-agent-sdk` upgraded `0.3.145 → 0.3.252`. `Query.interrupt()` now resolves to `SDKControlInterruptResponse | undefined` (interrupt receipt on `interrupt_receipt_v1`-capable CLIs); `ClaudeCodeSessionRuntime.query.interrupt` was widened to `() => Promise<unknown>` since OpenCodian discards the receipt. `SDKControlGetContextUsageResponse` kept `model` / `totalTokens` / `maxTokens` unchanged (new `agents` / `slashCommands` / `skills` fields are additive), so `getSessionContextUsageSnapshot()` normalization needed no adaptation.
- 2026-09-02 能力接入：`conversation_reset` → sdkSessionId 重映射（captureSdkSessionId 跳过 reset 消息防误抛）；`commands_changed` → `onCommandsChanged` 订阅 surface；`onUserDialog`/`supportedDialogKinds` options 透传；Codex app-server `cache_write_input_tokens` → snapshot.cacheWriteTokens。
- 2026-09-08：三后端 SDK 刷新到 Claude 0.3.263、Codex 0.153.4、OpenCode 1.18.29。`core.backend` 负责 Claude 稳定系统信号的类型化兼容边界、permission prompt 所有权、Codex 新 effort/thread source 与 OpenCode provider timeout 类型兼容；实验性 usage 与无宿主控件的能力不得伪装为已支持。

## Pi service delegation (2026-09-08)

Pi runtime is delegated to [core.backend-pi](core-backend-pi.md). This owner retains the common registry/contracts and existing OpenCode/Claude/Codex implementations; Pi runtime responsibilities do not accumulate here.

- 2026-09-15: 新增 `AgentAuxQueryCapability` 与三个 aux 会话实现（`auxiliary/OpenCodeAuxScope.ts`、`auxiliary/OpenCodeAuxQuerySession.ts`、`auxiliary/ClaudeCodeAuxQuerySession.ts`、`auxiliary/CodexAuxQuerySession.ts`）。OpenCode/Claude/Codex 三个 adapter 各自实现 `startAuxQuerySession()`，全部 fail closed；`AppServerThreadStartOptions` 增加 `ephemeral`。
