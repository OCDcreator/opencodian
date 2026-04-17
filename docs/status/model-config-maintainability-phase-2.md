# Model Config Maintainability Phase 2

> **Status**: [DONE]
> **Roadmap item**: `M2 - ModelConfigModal provider and model editor coarse extraction`
> **Build**: `autopilot-model-config-maintainability.202604172108`

## Scope

- Extracted provider-form rendering ownership out of `src/features/settings/ModelConfigModal.ts` into `src/features/settings/ModelConfigProviderEditor.ts`, including workspace/add-provider provider sections, toolbar actions, defaults, preview wiring, and shared editor controls.
- Extracted model list / model card rendering out of `src/features/settings/ModelConfigModal.ts` into `src/features/settings/ModelConfigModelListEditor.ts`, including workspace/add-provider model sections, fetched-model import panel, expand/collapse handling, and advanced key-value editors.
- Kept `ModelConfigModal.ts` as the modal shell / state owner / save orchestrator / service side-effect owner; line count dropped from `1846` to `800`.
- Added focused modal coverage for the new editor-owner paths, updated the directly related module docs plus maintainability status docs, and did not deploy.

## Changed Files

- `.eslintrc.cjs`
- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/ModelConfigProviderEditor.ts`
- `src/features/settings/ModelConfigModelListEditor.ts`
- `tests/unit/features/settings/ModelConfigModal.test.ts`
- `docs/modules/features/settings/ModelConfigModal.md`
- `docs/modules/features/settings/ModelConfigProviderEditor.md`
- `docs/modules/features/settings/ModelConfigModelListEditor.md`
- `docs/modules/README.md`
- `docs/status/development-maintainability-rules.md`
- `docs/status/model-config-maintainability-round-roadmap.md`
- `docs/status/model-config-maintainability-phase-2.md`

## Validation Commands

- `npm test -- tests/unit/features/settings/ModelConfigModal.test.ts`
- `npx eslint --fix src/features/settings/ModelConfigModal.ts src/features/settings/ModelConfigProviderEditor.ts src/features/settings/ModelConfigModelListEditor.ts tests/unit/features/settings/ModelConfigModal.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Notes

- Focused repair applied once during validation: added `src/features/settings/ModelConfigProviderEditor.ts` to the repo’s justified `max-lines` allowlist and ran `eslint --fix` to repair import ordering on touched files.
- `ModelConfigProviderEditor.ts` remains a coarse owner at `726` lines, while `ModelConfigModelListEditor.ts` stays at `429` lines; this keeps the modal shell thin without exploding file count into smaller wrappers.

## Next Recommended Slice

- `M3 - TrailingAssistantPatch helper defragmentation`: consolidate the thin `TrailingAssistantPatch*` helper family into a few semantic packages without moving ownership back into `OpenCodianView.ts`.
