# Owner: feature.settings-claude

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsClaudeCodeSection.ts`, `src/features/settings/SettingsClaudeConfigurationSection.ts`, `src/features/settings/SettingsClaudeProviderMetadataPersistenceCoordinator.ts`, `src/features/settings/SettingsClaudeProvidersSection.ts`, `src/features/settings/SettingsClaudeResourcesSection.ts`, `src/features/settings/ClaudeCodeHelpModal.ts`, `src/features/settings/ClaudeSettingsCommonFieldsPresenter.ts`, `src/features/settings/ClaudeSettingsContextSourcesPresenter.ts`, `src/features/settings/ClaudeSettingsHookFieldControls.ts`, `src/features/settings/ClaudeSettingsHooksBuilder.ts`, `src/features/settings/ClaudeSettingsMutationController.ts`

## Responsibilities
- Claude settings sections, configuration, provider metadata, resources
- Claude settings hooks builder and mutation controller

## Entrypoints
- `src/features/settings/SettingsClaudeCodeSection.ts`

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
