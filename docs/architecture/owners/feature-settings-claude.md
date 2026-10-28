# Owner: feature.settings-claude
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/backends/claude/SettingsClaudeCodeSection.ts`, `src/features/settings/backends/claude/SettingsClaudeConfigurationSection.ts`, `src/features/settings/backends/claude/SettingsClaudeProviderMetadataPersistenceCoordinator.ts`, `src/features/settings/backends/claude/SettingsClaudeProvidersSection.ts`, `src/features/settings/backends/claude/SettingsClaudeResourcesSection.ts`, `src/features/settings/backends/claude/ClaudeCodeHelpModal.ts`, `src/features/settings/backends/claude/ClaudeSettingsCommonFieldsPresenter.ts`, `src/features/settings/backends/claude/ClaudeSettingsContextSourcesPresenter.ts`, `src/features/settings/backends/claude/ClaudeSettingsHookFieldControls.ts`, `src/features/settings/backends/claude/ClaudeSettingsHooksBuilder.ts`, `src/features/settings/backends/claude/ClaudeSettingsMutationController.ts`

## Responsibilities
- Claude settings sections, configuration, provider metadata, resources
- Claude settings hooks builder and mutation controller

## Entrypoints
- `src/features/settings/backends/claude/SettingsClaudeCodeSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`

## Focused tests
- `tests/unit/features/settings/**Claude*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- 2026-09-08：Claude Skill 资源变更后的 runtime 刷新由本 owner 协调：SDK `reloadSkills()` 优先、persistent-query restart 兼容回退、slash catalog 同步失效。

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.settings-claude retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-02：现有设置恢复面提供一个活跃原生会话的输出样式目录重载和 MCP 收紧控制；无会话或不支持不派发，ACK 不推定有效配置，样式目录与新 query prompt 应用保持分离。

## 2026-10-05 external CLI boundary

Settings edits persist without implicitly replacing the live Claude query. Explicit restart errors are visible and keep active queries. Runtime MCP status distinguishes `null` unavailable from authoritative `[]` empty. The settings surface owns copy/error presentation; ClaudeCodeAdapter owns executable validation and native lifecycle.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-claude` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/backends/claude`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27：Claude 工作区新增 debug 二级页；模型与 Thinking 页承载 `autoTitle` 与 Claude 专属行内模型覆盖，运行时页移除重复技能/命令/Agent 管理入口。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.settings-claude` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
