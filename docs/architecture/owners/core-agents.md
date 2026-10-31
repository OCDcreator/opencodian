# Owner: core.agents
> 2026-09-21 (advantage-parity R-F7)：新增纯模块 `src/core/agents/BackendEnvironment.ts`（分域模型 normalize/resolve + 双 lane djb2-64 环境指纹 + detectChangedBackends + 批量指纹）。边界不变：无 I/O、无 feature/app 依赖。
> 2026-09-21 (advantage-parity R-F1)：AgentCapability 增 TurnSteering；AgentService 增 AgentTurnSteeringCapability 接口；PiAdapter 声明能力并实现 steerTurn（原生 RPC steer）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/agents/**`

## Responsibilities
- agent capability, catalog and invocation service
- child session graph and system agent guards

## Canonical state (truth home)
- agent service registry
- agent capability catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/index.ts`
- `src/core/agents/AgentInvocationService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.backend`, `feature.chat-send`, `feature.chat-shell`
- **Delegates to:** `core.backend`, `core.backend-diagnostics`

## Focused tests
- `tests/unit/core/agents/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.agents retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: 新增 `AgentCapability.AuxQuery`（`aux-query`）：backend 无关的一次性只读辅助查询能力标识，供 inline edit 按可选能力收窄调用（`AgentAuxQueryCapability`）。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `core.agents` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/core/agents`、`src/core/agents/imagegen`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `core.agents` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。

## Goal 与会话工作台（2026-10-30）

Goal 为独立 capability；统一 AgentGoalCapability/BackendGoalRuntime 仅定义 native/具名 extension 的投影与控制，不拥有自动循环。后端 runtime 继续是目标与执行事实来源。
