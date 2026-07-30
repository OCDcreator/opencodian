# Owner: feature.settings-style

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

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
