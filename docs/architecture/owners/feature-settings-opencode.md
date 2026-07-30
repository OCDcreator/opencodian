# Owner: feature.settings-opencode

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

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
