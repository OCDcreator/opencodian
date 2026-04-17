# Model Config Maintainability Round Roadmap

> **Status**: [PAUSED]
> **Rule**: Execute only the first `[NEXT]` item. On success, mark it `[DONE]` and promote exactly one following `[QUEUED]` item to `[NEXT]`; when no `[NEXT]` or `[QUEUED]` items remain, stop and wait for a manual requeue.

## Queue

### [DONE] M1 - ModelConfigModal state and save-plan coarse extraction

- **Lane**: Settings / model config modal coarse extraction
- **Goal**: Move durable non-UI state, snapshot, JSON draft, serialization, availability subset, disabled model refs, and save-plan logic out of `ModelConfigModal` while keeping the modal as lifecycle/orchestration shell.
- **Preferred modules**:
  - `src/features/settings/modelConfigModalState.ts`
  - `src/features/settings/modelConfigSavePlan.ts`
- **Allowed**:
  - Move existing pure helpers and related types when that creates a coherent module.
  - Add focused tests around save-plan/state helpers if adjacent coverage is insufficient.
  - Update directly related module docs.
- **Forbidden**:
  - Do not start provider/model card UI extraction in this round.
  - Do not add more than two production modules for this slice.
  - Do not change model config persistence semantics or disabled model ref behavior.
- **Acceptance**:
  - `ModelConfigModal.ts` line count and private method surface drop materially.
  - Behavior is preserved with focused tests plus full lint/typecheck/test/build.

### [DONE] M2 - ModelConfigModal provider and model editor coarse extraction

- **Lane**: Settings / model config modal UI ownership
- **Goal**: Move provider editor sections and model card/list editing into one or two cohesive editor owners while keeping `ModelConfigModal` as shell and save orchestrator.
- **Preferred modules**:
  - `src/features/settings/ModelConfigProviderEditor.ts`
  - `src/features/settings/ModelConfigModelListEditor.ts`
- **Allowed**:
  - Move related rendering config/types with their owner.
  - Touch `src/style/modals/config-editor-modal.css` only for selector grouping required by the new owner boundaries.
- **Forbidden**:
  - Do not split every section into separate small files.
  - Do not redesign the modal UX.
- **Acceptance**:
  - `ModelConfigModal.ts` becomes a clear orchestration shell.
  - Provider/model editor owners are cohesive and not thin wrappers.

### [DONE] M3 - TrailingAssistantPatch helper defragmentation

- **Lane**: Chat service defragmentation
- **Goal**: Consolidate the many tiny `TrailingAssistantPatch*Helper.ts` files into a few semantic packages without moving code back into `OpenCodianView`.
- **Preferred packages**:
  - `trailingAssistantPatchPlanning.ts`
  - `trailingAssistantPatchExecution.ts`
  - `trailingAssistantPatchDebug.ts`
  - optional `trailingAssistantPatchTypes.ts`
- **Allowed**:
  - Merge thin helpers and update imports/tests/docs.
- **Forbidden**:
  - Do not create new chat helper files to replace old helper files one-for-one.
  - Do not change assistant tail rendering/finalization semantics.
- **Acceptance**:
  - File count in the `TrailingAssistantPatch*` family drops materially.
  - Tests covering assistant tail/finalization continue to pass.

### [DONE] M4 - ProviderIconService medium responsibility extraction

- **Lane**: Provider icon service maintainability
- **Goal**: Split `ProviderIconService` into medium modules for entry resolution, asset/cache runtime, custom sources, and builtin selection while preserving runtime behavior and fallback order.
- **Preferred modules**:
  - `providerIconEntryResolution.ts`
  - `providerIconAssetCache.ts`
  - `providerIconCustomSources.ts`
  - `providerIconBuiltinSelection.ts`
- **Forbidden**:
  - Do not split into many tiny files.
  - Do not change LobeHub/builtin/custom fallback priority.
- **Acceptance**:
  - `ProviderIconService.ts` becomes a thinner orchestrator.
  - Existing provider icon tests and full validation pass.

### [DONE] M5 - SettingsStyleSection controls and preset coarse extraction

- **Lane**: Settings style section maintainability
- **Goal**: Extract reusable numeric/color/reset control primitives and theme preset rendering/state into coarse modules.
- **Preferred modules**:
  - `settingsStyleControls.ts`
  - `SettingsStylePresetSection.ts`
- **Forbidden**:
  - Do not split each control into a separate file.
  - Do not change theme preset semantics or CSS variable behavior.
- **Acceptance**:
  - `SettingsStyleSection.ts` loses control/preset bulk while retaining section orchestration.
  - Focused settings style tests and full validation pass.

### [DONE] M6 - Completion audit and final verification

- **Lane**: Queue closeout
- **Goal**: Audit module boundaries, docs, line counts, and validation after M1-M5.
- **Allowed**:
  - Update stale docs and fix directly discovered test/doc gaps.
- **Forbidden**:
  - Do not start new maintainability work.
- **Acceptance**:
  - Full `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
  - Return `goal_complete` only when no `[NEXT]` or `[QUEUED]` items remain.

## Current State

- `M1-M6` are complete.
- There is currently no `[NEXT]` or `[QUEUED]` item in this queue.
- Any future maintainability work on this lane must start with a manually written follow-up backlog before autopilot resumes.
