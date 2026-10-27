# Owner: feature.settings-opencode
> 2026-10-24（DSH）：SettingsBackendSection 将 DSH 控件委托给现有 settings-shell owner 下的 SettingsDshSection；只组装设置/连接读取端口，MCP 校验复用 core.backend 的协议边界。
> 2026-09-22 (ZCode 票 01)：OpenCodianSettings 经典布局在 ZCode 激活时渲染 SettingsZCodeSection（与 pi 同模式）；设置面只读 adapter 诊断快照，不持有 ZCode 运行时状态。
> 2026-09-21 (advantage-parity R-F4)：SettingsBackendSection 在默认 backend 旁增加默认关闭的聊天预热 toggle；下拉切换与禁用 active backend 后的 fallback 通知组合根排他预热。设置面只发宿主命令，不持有 pool。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

Pricing readiness (2026-09-10): CostEstimateSettingsRow can refresh backend-specific catalog descriptions without reconstructing settings controls; subscription ownership remains in the settings shell.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/backends/opencode/SettingsBackendSection.ts`, `src/features/settings/backends/opencode/OpencodeConfigModal.ts`, `src/features/settings/backends/opencode/OpenCodeProjectConfigHelpModal.ts`, `src/features/settings/backends/opencode/projectAgentEditorConfig.ts`, `src/features/settings/backends/opencode/ProjectConfigFileWatcher.ts`, `src/features/settings/backends/opencode/SettingsProjectAgentEditor.ts`, `src/features/settings/backends/opencode/SettingsProjectCommandEditor.ts`, `src/features/settings/backends/opencode/SettingsServerSection.ts`, `src/features/settings/backends/opencode/ServerSettingHelpModal.ts`, `src/features/settings/backends/opencode/SettingsCommandsSection.ts`, `src/features/settings/backends/opencode/CostEstimateSettingsRow.ts`

## Responsibilities
- OpenCode backend/server sections, opencode config modal, project config help/file watcher
- project agent/command editors, commands section, cost estimate row

## Entrypoints
- `src/features/settings/backends/opencode/OpencodeConfigModal.ts`
- `src/features/settings/backends/opencode/SettingsServerSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.opencode`, `core.config`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.opencode`

## Focused tests
- `tests/unit/features/settings/**Opencode*`
- `tests/unit/features/settings/**Server*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The shared backend chooser exposes Pi and mounts SettingsPiSection when enabled. Pi settings controls are owned by feature.settings-shell, not the OpenCode settings implementation.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

## 2026-09-27 OpenCode 2 compatibility

Settings expose OpenCode 1 and 2 separately and provide local executable or remote server controls for OpenCode 2.

2026-10-07: OpenCode 2 directory read controls render classified state and fixed bilingual text on failed/denied/absent endpoints.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-opencode` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-23 DSH connection settings

既有 `SettingsBackendSection` 增加 DSH 启用项和可执行路径/工作目录/测试连接控件。控件只保存 core.types 设置或调用 core.backend 的 `start()`；不创建原生会话、发送模型提示或持有持久连接 listener。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/backends/opencode`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

> 2026-10-27：`SettingsBackendSection` 只保留默认后端、启用开关与预热策略；OpenCode 2 连接/认证/MCP/资源工作区同 owner 托管（避免新增 settings SCC 成员）；catalog 失败使用固定脱敏分类。
