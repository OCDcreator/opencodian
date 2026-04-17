# Model Config Maintainability Lane Map

> **Status**: [ACTIVE]
> **Use**: Quick map for the current controlled maintainability queue. Execute the first `[NEXT]` item from `model-config-maintainability-round-roadmap.md`; do not freestyle.

## Priority Order

1. `ModelConfigModal` coarse extraction.
2. Chat `TrailingAssistantPatch*` defragmentation.
3. `ProviderIconService` responsibility split.
4. `SettingsStyleSection` control / preset extraction.
5. Completion audit.

## Hotspots And Intent

- `src/features/settings/ModelConfigModal.ts`: split along durable modal state/save/provider-editor/model-list boundaries; keep the modal as orchestration shell.
- `src/style/modals/config-editor-modal.css`: only touch if modal boundary changes make selector grouping stale; do not perform a pure CSS redesign.
- `src/features/chat/services/TrailingAssistantPatch*`: package many thin helpers into a few semantic files; this is consolidation, not extraction.
- `src/utils/icons/ProviderIconService.ts`: preserve fallback order while moving entry resolution, asset/cache runtime, custom sources, and builtin selection into medium modules.
- `src/features/settings/SettingsStyleSection.ts`: only extract reusable style controls and preset rendering into coarse modules.

## Do Not Touch Unless Blocked

- `src/features/chat/OpenCodianView.ts` broad refactors.
- `src/core/types/settings.ts` decomposition.
- `src/core/opencode/OpenCodeService.ts` or `src/core/opencode/ServerManager.ts` maintainability lanes.
- `reference-projects/`.

## Validation

- Focused tests matching changed owners.
- Full `npm run lint` with 0 errors / 0 warnings.
- Full `npm run typecheck`.
- Full `npm test`.
- Full `npm run build`.
