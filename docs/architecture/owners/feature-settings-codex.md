# Owner: feature.settings-codex
> 2026-10-07：本 owner 的 Codex 显式重载操作等待设置保存后调用宿主 reload 接口；缺少 reloadPlugin 时使用顺序 unloadPlugin/loadPlugin，保留 enabled 状态并将保存失败和 false load 作为失败。没有把宿主生命周期责任迁移到 main 或 backend。
> 2026-09-30 (Codex 0.159 integration)：
> - 新增 `SettingsCodexPluginsSection`（插件市场/已安装浏览器，install/uninstall/reconcile，backend 不可用时诚实状态），注册为第 7 个 tab。
> - `SettingsCodexAccountSurface` 增加 usage 分析卡片（全 null 空态）；approval 下拉不再含 `untrusted`。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/backends/codex/SettingsCodexSection.ts`, `src/features/settings/backends/codex/SettingsCodexProjectConfigSection.ts`, `src/features/settings/backends/codex/SettingsCodexAccountSurface.ts`, `src/features/settings/backends/codex/SettingsCodexLegacyCredentialControl.ts`, `src/features/settings/backends/codex/SettingsCodexReadbackControls.ts`, `src/features/settings/backends/codex/SettingsCodexResourcesSection.ts`, `src/features/settings/backends/codex/CodexMcpServerDetailModal.ts`, `src/features/settings/backends/codex/CodexMcpServerDetailRenderers.ts`, `src/features/settings/backends/codex/CodexProjectConfigFormModel.ts`, `src/features/settings/backends/codex/CodexReadbackModal.ts`

## Responsibilities
- Codex settings sections, project config, account surface, credentials, readback controls, resources
- Codex MCP server detail modal

## Entrypoints
- `src/features/settings/backends/codex/SettingsCodexSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`

## Focused tests
- `tests/unit/features/settings/**Codex*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- 2026-09-08：Codex 全局与项目配置 UI/校验共同接入 `max`、`ultra`、`persistent`，保持结构化设置为权威配置面。

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.settings-codex retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-02：模型、权限、MCP 与 loaded threads 读回面消费 Codex catalog 结果，保留 partial 及错误边界；候选 gatewayOAuth/MCP App/disabledPluginIds 的 T11 探测与生产默认关闭分别记录。

## 2026-10-06 Codex catalog permission denial

CodexReadbackModal 和 CodexMcpServerDetailModal 从结构化目录失败中识别权限拒绝，只展示固定本地化说明。状态、已读取 partial 条目和重试流程仍由原 modal 持有，不新增目录真值或跨 owner 配置权。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-codex` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/backends/codex`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27：Codex 连接/模型推理搜索拆分，模型页承载 Codex 专属行内模型覆盖；新增 debug 二级页，classic 子页由共享本地导航逐页挂载。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `feature.settings-codex` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
