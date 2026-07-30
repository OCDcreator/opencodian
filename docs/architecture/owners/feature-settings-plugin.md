# Owner: feature.settings-plugin

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsPluginSection.ts`, `src/features/settings/SettingsPluginEvidenceCoordinator.ts`, `src/features/settings/SettingsPluginEvidencePresenter.ts`, `src/features/settings/SettingsPluginUpdateSection.ts`, `src/features/settings/SettingsConversationSection.ts`, `src/features/settings/ConversationCompactionHelpModal.ts`, `src/features/settings/SettingsSecuritySection.ts`, `src/features/settings/SettingsFormatterSection.ts`, `src/features/settings/SettingsAcpSection.ts`, `src/features/settings/SettingsUiSection.ts`, `src/features/settings/SettingsUserSection.ts`, `src/features/settings/settingsBackendGuards.ts`, `src/features/settings/providerPresets.ts`, `src/features/settings/ModifiedFilesSidebarHelpModal.ts`, `src/features/settings/ProviderBuiltinIconPickerModal.ts`, `src/features/settings/ProviderIconCacheModal.ts`

## Responsibilities
- plugin, update, conversation, security, formatter, acp, ui and user settings sections
- plugin evidence coordinator/presenter, provider icon cache/picker modals, provider presets

## Entrypoints
- `src/features/settings/SettingsPluginSection.ts`
- `src/features/settings/SettingsPluginUpdateSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-icons`, `core.update`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.update`

## Focused tests
- `tests/unit/features/settings/**Plugin*`
- `tests/unit/features/settings/**Provider*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
