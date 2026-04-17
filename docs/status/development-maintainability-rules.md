# Development Maintainability Rules

> **Status**: active development guardrail.
> **Purpose**: keep routine feature work at the high-maintainability checkpoint reached after `R162`.

## Baseline

- `npm run lint` must stay at `0 errors / 0 warnings`.
- `npm run typecheck` must pass.
- Full `npm test` must pass before merge.
- `npm run build` must pass before merge.
- Use `npm run verify` as the default local pre-merge command.

## Ownership Rules

- Do not add new runtime ownership to `src/features/chat/OpenCodianView.ts` or `src/core/opencode/OpenCodeService.ts`.
- When touching those files, prefer deleting assembly/import surface or moving stable responsibility into an existing adjacent owner.
- Do not add thin helper / adapter / provider / factory modules unless the module is reused in 3+ places or isolates a high-risk dependency.
- Do not move complexity sideways into more files without reducing ownership, import surface, or test responsibility.
- Prefer existing service / coordinator / runtime owners before creating new files.
- For model-config modal UI work, prefer the existing `ModelConfigProviderEditor.ts` / `ModelConfigModelListEditor.ts` owners before growing `ModelConfigModal.ts` again.
- For trailing-assistant patch work, extend the coarse `trailingAssistantPatchPlanning.ts` / `trailingAssistantPatchExecution.ts` / `trailingAssistantPatchDebug.ts` / `trailingAssistantPatchTypes.ts` bundles instead of reintroducing one-off helper files.

## Feature Work Checklist

1. Identify the owner before coding: UI, runtime, OpenCode service, settings, storage, theme, or tests.
2. Keep new behavior local to that owner; avoid cross-domain callbacks or duplicate state.
3. Add or update focused tests for behavior changes.
4. Update matching `docs/modules/**` documentation when a module boundary changes.
5. Run `npm run verify` before merging.

## When To Pause

- A change requires adding a new helper layer that is not broadly reused.
- A change increases `OpenCodianView.ts` or `OpenCodeService.ts` ownership instead of reducing it.
- Lint warnings appear and the fix is not obvious.
- Tests need assertions removed or weakened to pass.

In these cases, stop and design a small controlled queue or ask for review instead of continuing ad hoc.
