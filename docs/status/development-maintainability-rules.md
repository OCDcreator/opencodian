# Development Maintainability Rules

> **Status**: active development guardrail.
> **Purpose**: keep routine feature work at the high-maintainability checkpoint reached after `R162`.

## Baseline

- `npm run verify:architecture` (owner-manifest / owner-boundaries / dependency-direction / architecture-cycles / architecture-approvals) must pass.
- `npm run check:module-docs` must pass.
- `npm run check:graphify` must pass after `src/` or config/tool envelope changes (content-addressed digest, Phase 2 Task 7).
- `npm run lint` must stay at `0 errors / 0 warnings`.
- `npm run typecheck` must pass.
- Full `npm test` must pass before merge.
- `npm run build` must pass before merge.
- Use `npm run verify` as the default local pre-merge command; it now runs the architecture gates (manifest/boundaries/dependency-direction/cycles/approvals), module-doc + owner-impact, content-addressed Graphify freshness, devlog order, lint, typecheck, tests and build.

## Ownership Rules

- Do not add new runtime ownership to `src/features/chat/OpenCodianView.ts`, `src/core/opencode/OpenCodeService.ts`, `src/main.ts`, or `src/core/opencode/ServerManager.ts`.
- When touching those files, prefer deleting assembly/import surface or moving stable responsibility into an existing adjacent owner.
- Owner boundaries are now evaluated by `npm run check:owner-boundaries` against the canonical `architecture-owners.config.json` (Phase 1 Task 4), replacing the retired hard-coded path guard. Local `verify`, pre-push, PR and push all use the same unified scope (`npm run verify:architecture`); protected CI remains the final non-bypassable gate. The old `OWNER_GUARD_APPROVED` / `--approved` free-text waiver is retired — budget waivers now require a structured diff-bound approval request validated by an external protected-CI authority (see `docs/architecture/approvals/README.md`).
- Composition-line growth inside a declared owner responsibility can pass; pass/fail is never based solely on added/removed line count. The net-line `maintainability-refactor` requirement is removed from active semantics.
- Do not add thin helper / adapter / provider / factory modules unless the module is reused in 3+ places or isolates a high-risk dependency.
- Do not move complexity sideways into more files without reducing ownership, import surface, or test responsibility.
- Prefer existing service / coordinator / runtime owners before creating new files.
- Canonical OpenCode `session/message/part` truth belongs in `src/core/opencode/OpenCodeSessionStateStore.ts`; do not reintroduce ad-hoc graph state inside `OpenCodeService.ts` or chat view-model code.
- For model-config modal UI work, prefer the existing `ModelConfigProviderEditor.ts` / `ModelConfigModelListEditor.ts` owners before growing `ModelConfigModal.ts` again.
- For trailing-assistant patch work, extend the coarse `trailingAssistantPatchPlanning.ts` / `trailingAssistantPatchExecution.ts` / `trailingAssistantPatchDebug.ts` / `trailingAssistantPatchTypes.ts` bundles instead of reintroducing one-off helper files.
- For provider icon work, extend `providerIconEntryResolution.ts` / `providerIconBuiltinSelection.ts` / `providerIconCustomSources.ts` / `providerIconAssetCache.ts` before regrowing `ProviderIconService.ts`.
- For style-settings work, extend `settingsStyleControls.ts` / `SettingsStylePresetSection.ts` / the existing background or input subsection owners before regrowing `SettingsStyleSection.ts`.

## Feature Work Checklist

1. Identify the owner before coding: UI, runtime, OpenCode service, settings, storage, theme, or tests.
2. Keep new behavior local to that owner; avoid cross-domain callbacks or duplicate state.
3. Add or update focused tests for behavior changes.
4. Update matching `docs/modules/**` documentation when a module boundary changes.
5. For added / deleted / renamed modules, confirm `npm run check:module-docs` stays green so mapping coverage and diff accountability both hold.
6. Run `npm run verify` before merging.

## When To Pause

- A change requires adding a new helper layer that is not broadly reused.
- A change increases `OpenCodianView.ts`, `OpenCodeService.ts`, `main.ts`, or `ServerManager.ts` ownership instead of reducing it.
- Lint warnings appear and the fix is not obvious.
- Tests need assertions removed or weakened to pass.

In these cases, stop and design a small controlled queue or ask for review instead of continuing ad hoc.
