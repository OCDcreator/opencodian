# Model Config Maintainability Lane Map

> **Status**: [PAUSED]
> **Use**: Quick map for the completed controlled maintainability queue. There is currently no active `[NEXT]`; use this file as the retained boundary map until a new manual queue exists.

## Current State

- **Current `[NEXT]`**: none
- **Queue outcome**: `M1-M6` complete; the controlled queue is closed.
- **Validation baseline**: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass at the `M6` closeout checkpoint.

## Retained Boundary Map

- `src/features/settings/ModelConfigModal.ts`: now remains the modal shell; extend `modelConfigModalState.ts`, `modelConfigSavePlan.ts`, `ModelConfigProviderEditor.ts`, or `ModelConfigModelListEditor.ts` before regrowing the shell.
- `src/style/modals/config-editor-modal.css`: unchanged by the closeout round; only touch it if a future modal boundary change genuinely makes selector grouping stale.
- `src/features/chat/services/trailingAssistantPatch*.ts`: the defragmented planning/execution/debug/types bundles are now the durable chat patch owners; do not recreate one-off helper files around them.
- `src/utils/icons/ProviderIconService.ts`: remains the public static orchestrator; extend the entry-resolution, builtin-selection, custom-source, or asset-cache owners before pushing runtime detail back into the shell.
- `src/features/settings/SettingsStyleSection.ts`: remains the section shell; extend `settingsStyleControls.ts`, `SettingsStylePresetSection.ts`, or the existing background/input subsection owners before regrowing it.

## Resume Rules

- Do not auto-start another round from this lane map; write a new manual queue item first.
- Keep `src/features/chat/OpenCodianView.ts`, `src/core/types/settings.ts`, `src/core/opencode/OpenCodeService.ts`, `src/core/opencode/ServerManager.ts`, and `reference-projects/` out of scope unless a future queue explicitly reopens them.
- Continue avoiding thin helper / adapter / provider / factory sprawl and continue to preserve fallback order, persistence semantics, and style/chat runtime behavior.

## Validation

- Focused tests matching changed owners when future rounds touch code or tests.
- Full `npm run lint` with 0 errors / 0 warnings.
- Full `npm run typecheck`.
- Full `npm test`.
- Full `npm run build`.
