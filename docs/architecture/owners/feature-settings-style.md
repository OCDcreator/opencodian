# Owner: feature.settings-style

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsStyleSection.ts`, `src/features/settings/settingsStyleControls.ts`, `src/features/settings/SettingsStyleInputPanelSection.ts`, `src/features/settings/SettingsStyleLiquidGlassInputControls.ts`, `src/features/settings/SettingsStylePresetSection.ts`, `src/features/settings/SettingsStyleBackgroundSection.ts`, `src/features/settings/InputFontRegistry.ts`, `src/features/settings/LiquidGlassSettingHelpModal.ts`

## Responsibilities
- settings style sections, controls, presets, background, input panel and liquid glass controls
- input font registry

## Entrypoints
- `src/features/settings/SettingsStyleSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-glass`, `core.theme`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.theme`, `feature.chat-appearance`

## Focused tests
- `tests/unit/features/settings/**Style*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.settings-style retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## User bubble style control (2026-09-11)

用户气泡样式组新增「气泡样式」下拉（solid 默认 / glass）。`SettingsStyleSection` 将用户组正文抽为 `renderUserStyleGroupBody()`，切换样式或重置分组时重渲染：毛玻璃专属的「气泡模糊」滑块仅在 glass 模式下渲染。`SettingsStyleControls.createStyleResetSetting()` 新增可选 `onAfterReset` 回调支撑该重渲染链路。
