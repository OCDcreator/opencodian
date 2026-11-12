# Owner: core.backend-diagnostics
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

2026-11-10（DSH wire trace 实施机制——源码已成型冻结交独立复核，安全 PASS 与宿主验收待完成）：本 owner 新增 `DshSessionTraceService` 与 DSH wire-trace 契约类型（`DshTraceEventV1`／`DshWireRecord`／`DshClientTraceHook`／`DshSessionTraceSettings`／`DshTracePort`）。契约刻意收窄为 metadata-only：客户端 hook 只转发字段级白名单的会话更新元数据与生命周期/计时（`rawInput`／`content`／`arguments` 等载荷永不转发），service 入库前再经 hardened 共享 redactor 二次脱敏；无独立 ring buffer、无 deep capture、无任何 content capture 面，stderr 完全不采集。实施机制：每个 client 实例一个 `sourceId`（UUID）、每次 start 一个 generation，wire 记录携带该身份；白名单仅含 sessionUpdate 名、截断并擦除凭据形态的 toolCallId/messageId、枚举集合内的 kind/status 与数值 token/时间字段，title/reason/raw error 等自由文本不在任何采集路径；错误只记固定分类 + 数值 `errorCode` + 严格 `stopReason` 枚举（未知值不 trace）。service 的 pending/session/dead 簿记按 `source@generation` 隔离，容量按语义分三类：①保护状态不逐出——per-trace 预算表（1024）满即 fail-closed 拒绝新 trace，绝不淘汰已有预算（否则已封顶的 trace 会悄悄重新计数）；source 登记表（1024）只由显式 `starting` 边界登记，已 closed 的同代 `starting`/`connected` 都不能重开，未登记的未知源拒收，表满拒新源并写一次性 runtime 标记，dead 墓碑同样不逐出（受 source 登记总上限约束）；②可逐出缓存——open turn、server request 与 session 绑定缓存超限淘汰最旧（session 绑定淘汰只丢缓存，store 索引仍在）；③采集预算——每 trace 2000 事件，超限写单条 `trace.session_limit` 标记后该 trace 停采；本 service 实例全部 trace 合计 40000 事件，超限写单条 `trace.capture_limit` 全局标记后全部停采；从既有 summary seed 预算时不重复追加标记。global/source/budget 任一表满或预算封顶都在账本以 `limited` 呈现，summary 事件数超过 8000 时拒读全量历史、只报已知 summary 计数。transport 门关闭时生命周期登记与 dead 标记仍在有界内存中进行但不落盘。以上是本 service 实例内的采集与簿记边界，不是跨运行的永久磁盘硬上限——持久历史的保留仍以既有共享 `TraceStore` 策略为界。非交互 wire 轮询/控制读取不落盘；store 在 bind 前 enable；traceId 按 source/session 派生。会话绑定与回合生命周期只从 wire 记录推导（adapter 不发起 trace 调用，注入 observer 是唯一缝）；native/ACP 门独立；死代 transport 迟到记录丢弃；trace 故障被吸收、不影响聊天路径。上下文 UI 账本是白名单行投影（300 行上限）：行时间恒为 client 观测，tool span 仅在显式 completed/failed 终端状态配对时计算，RPC 成功只记 `response-received` 客户端收据、不推断执行成功——不可表述为官方/后台执行时长。consolePreset/channels/store 目录实际消费，暂无设置 UI。独立复核与宿主验收完成前不作验收声明；review 如有 fix 再更新本段。

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/agents/backend/diagnostics/**`

## Responsibilities
- Codex and Claude backend trace services and ring buffers
- hardened redaction with dynamically collected backend credentials
- trace channels independent from chat paths

## Canonical state (truth home)
- Codex trace service/store
- Claude trace service/store

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/backend/diagnostics/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.diagnostics`, `core.opencode-diagnostics`, `feature.chat-diagnostics`

## Focused tests
- `tests/unit/core/agents/backend/diagnostics/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.backend-diagnostics retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `core.backend-diagnostics` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/core/agents/backend/diagnostics`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `core.backend-diagnostics` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
- 2026-11-12 (claude-provider-clarity) owner manifest 核对：与基线 1d3fa289 对 architecture-owners.config.json 做程序化逐 owner deep-equal 对比，全仓仅 feature.settings-claude 的 include 纯插入新增 `src/features/settings/backends/claude/SettingsClaudeProviderModals.ts`（无删除、无其他字段变化）；本 owner（core.backend-diagnostics）的 include、responsibilities、canonical state 与依赖约束逐项对比未变。此为 manifest-diff 核对记录，不构成全量架构评审。
