# Owner: feature.settings-model-catalog

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/SettingsModelCatalogAvailability.ts`, `src/features/settings/SettingsModelCatalogCoordinator.ts`, `src/features/settings/SettingsModelCatalogPresenter.ts`, `src/features/settings/SettingsModelIconCacheManager.ts`, `src/features/settings/SettingsModelSection.ts`, `src/features/settings/ModelConfigModal.ts`, `src/features/settings/modelConfigModalState.ts`, `src/features/settings/ModelConfigModelListEditor.ts`, `src/features/settings/ModelConfigProviderEditor.ts`, `src/features/settings/modelConfigSavePlan.ts`, `src/features/settings/modelConfigStructuredOptions.ts`, `src/features/settings/ModelConfigStructuredOptionsEditor.ts`, `src/features/settings/modelConfigWorkspace.ts`, `src/features/settings/modelPicker.ts`, `src/features/settings/ModelPickerModal.ts`, `src/features/settings/ModelPricingModal.ts`, `src/features/settings/ModelConfigJsonModal.ts`

## Responsibilities
- model catalog presenter, coordinator, modal and editors
- model picker, pricing modal and icon cache management

## Canonical state (truth home)
- model config modal state
- model picker state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/SettingsModelCatalogPresenter.ts`
- `src/features/settings/ModelConfigModal.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-icons`, `core.config`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.config`

## Focused tests
- `tests/unit/features/settings/**Model*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
