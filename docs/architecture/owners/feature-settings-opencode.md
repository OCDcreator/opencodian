# Owner: feature.settings-opencode
> 2026-09-22 (ZCode 票 01)：OpenCodianSettings 经典布局在 ZCode 激活时渲染 SettingsZCodeSection（与 pi 同模式）；设置面只读 adapter 诊断快照，不持有 ZCode 运行时状态。
> 2026-09-21 (advantage-parity R-F4)：SettingsBackendSection 在默认 backend 旁增加默认关闭的聊天预热 toggle；下拉切换与禁用 active backend 后的 fallback 通知组合根排他预热。设置面只发宿主命令，不持有 pool。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

Pricing readiness (2026-09-10): CostEstimateSettingsRow can refresh backend-specific catalog descriptions without reconstructing settings controls; subscription ownership remains in the settings shell.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsBackendSection.ts`, `src/features/settings/OpencodeConfigModal.ts`, `src/features/settings/OpenCodeProjectConfigHelpModal.ts`, `src/features/settings/projectAgentEditorConfig.ts`, `src/features/settings/ProjectConfigFileWatcher.ts`, `src/features/settings/SettingsProjectAgentEditor.ts`, `src/features/settings/SettingsProjectCommandEditor.ts`, `src/features/settings/SettingsServerSection.ts`, `src/features/settings/ServerSettingHelpModal.ts`, `src/features/settings/SettingsCommandsSection.ts`, `src/features/settings/CostEstimateSettingsRow.ts`

## Responsibilities
- OpenCode backend/server sections, opencode config modal, project config help/file watcher
- project agent/command editors, commands section, cost estimate row

## Entrypoints
- `src/features/settings/OpencodeConfigModal.ts`
- `src/features/settings/SettingsServerSection.ts`

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
