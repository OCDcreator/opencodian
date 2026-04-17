# Model Config Maintainability Master Plan

> **Status**: [PAUSED]
> **Purpose**: Controlled unattended maintainability queue for coarse package extraction and defragmentation after the Agents / Commands / Session Settings feature line completed.
> **Base**: Branch `autopilot/model-config-maintainability`, starting from feature-complete commit `d14186f`.
> **Auto-advance state**: `M6` closeout is complete; there is currently no `[NEXT]` or `[QUEUED]` item, so this autopilot queue is paused until a new manual backlog is written.

## Objective

Improve maintainability without creating more thin helper sprawl:

1. Coarsely extract `ModelConfigModal` into a small number of cohesive modules.
2. Defragment the overly granular `TrailingAssistantPatch*` helper family into semantic bundles.
3. Medium-split `ProviderIconService` by durable responsibility boundaries.
4. Coarsely extract reusable style controls / preset UI from `SettingsStyleSection`.
5. Preserve `lint 0/0`, typecheck, full tests, and production build.

## Current Baseline

- `ModelConfigModal` closeout is complete: `src/features/settings/ModelConfigModal.ts` now sits at `800` lines, with `modelConfigModalState.ts` (`133`), `modelConfigSavePlan.ts` (`365`), `ModelConfigProviderEditor.ts` (`726`), and `ModelConfigModelListEditor.ts` (`429`) owning the extracted state/save/editor seams.
- The trailing-assistant helper defragmentation is complete: `trailingAssistantPatchPlanning.ts` (`265`), `trailingAssistantPatchExecution.ts` (`297`), `trailingAssistantPatchDebug.ts` (`441`), and `trailingAssistantPatchTypes.ts` (`374`) hold the chat patch responsibilities without reintroducing thin helpers.
- Provider-icon extraction is complete: `src/utils/icons/ProviderIconService.ts` is down to `222` lines, with `providerIconEntryResolution.ts` (`336`), `providerIconAssetCache.ts` (`596`), `providerIconCustomSources.ts` (`387`), and `providerIconBuiltinSelection.ts` (`556`) owning the durable seams.
- Style-settings extraction is complete: `src/features/settings/SettingsStyleSection.ts` is down to `791` lines, with `settingsStyleControls.ts` (`539`) and `SettingsStylePresetSection.ts` (`210`) holding the extracted control/preset bulk.
- M6 closeout validation passed on this branch with `npm run lint`, `npm run typecheck`, `npm test` (`294` suites / `1258` tests), and `BUILD_ID=autopilot-model-config-maintainability.202604172223 npm run build`.

## Guardrails

- Do not create thin helper / adapter / provider / factory files.
- Prefer 2-4 cohesive modules per package-level extraction; never split one function family into many sub-100-line files.
- New files should generally be at least ~120 lines or own a complete responsibility, unless they are type barrels or unavoidable test fixtures.
- Do not move code merely to reduce a line count; each module boundary must have a stable semantic name and clear ownership.
- Do not regress public behavior, model config persistence semantics, provider icon fallback order, slash command behavior, or chat streaming/session behavior.
- Do not deploy to Test Vault in this queue.
- Every successful code round must run targeted tests first, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Out Of Scope

- Large `OpenCodianView` refactors.
- `settings.ts` decomposition.
- New feature work.
- Global OpenCode config writes.
- Test Vault deployment.

## Reading Order

1. `AGENTS.md`
2. `docs/status/model-config-maintainability-master-plan.md`
3. `docs/status/model-config-maintainability-round-roadmap.md`
4. `docs/status/model-config-maintainability-lane-map.md`
5. Latest `docs/status/model-config-maintainability-phase-*.md`, when present
