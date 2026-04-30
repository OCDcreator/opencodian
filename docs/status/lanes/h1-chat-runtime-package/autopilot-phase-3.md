## Round Design

Exact `[NEXT]` slice: Task 3 - Package chat shell control seams and checkpoint hotspot deltas.

Lane: `h1-chat-runtime-package` (`H1 - Package the chat runtime hotspot`). Goal: reduce one more slice of view-local shell wiring around input/selection/render refresh while documenting before/after hotspot evidence for the lane handoff. Constraints: execute only Task 3, stay within the listed chat shell-control owners/tests/docs, introduce no new thin helper/adapter/provider/factory files, do not push new runtime ownership into `OpenCodianView.ts` or `OpenCodeService.ts`, and do not start another lane or round. Acceptance criteria: the lane can hand off with explicit hotspot delta notes, view-local shell-control ownership shrinks measurably, and no new ownership is pushed back into the view.

Targeted hotspot files and adjacent owners:

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `src/features/chat/services/ConversationRenderService.ts`
- Matching tests and module docs for the touched shell-control owner.

Before/after ownership surface intended to shrink:

- Before: `OpenCodianView.ts` still owns some direct shell-control glue around input panel appearance, chat selection controls, and render-refresh calls while adjacent owners handle narrower pieces.
- After: one stable, multi-call shell-control seam should move from the view into an existing adjacent owner so the view delegates a higher-level operation instead of assembling lower-level input/selection/render details itself.

Tests and docs likely to change:

- Targeted validation from the roadmap: `npm test -- --runInBand tests/unit/features/chat/InputPanelAppearanceCoordinator.test.ts tests/unit/features/chat/modelSelectorDisplay.test.ts tests/unit/features/chat/modelSelectorInteractions.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts`.
- Additional focused tests only if the selected seam has a closer existing test file.
- Module docs for `OpenCodianView` plus the owner that absorbs the seam.
- `graphify-out/**` after any `src/` change.
- This phase doc and the H1 roadmap queue state.

Explicit non-goals:

- Do not refactor unrelated chat rendering, hydration, question, background-task, or OpenCode service paths.
- Do not add new runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`.
- Do not create a new helper file unless a durable multi-call ownership boundary is impossible in existing owners.
- Do not change stable UI behavior or Test Vault deployment state.
- Do not start `h2-opencode-runtime-package` in this round.

## Hotspot Baseline

- `src/features/chat/OpenCodianView.ts`: 5340 lines, 88 import statements at round start.
- `src/features/chat/services/InputPanelAppearanceCoordinator.ts`: 357 lines, 3 import statements at round start.
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`: 447 lines, 10 import statements at round start.
- `src/features/chat/services/ConversationRenderService.ts`: 277 lines, 9 import statements at round start.
- Previous successful phase recorded `OpenCodianView.ts` shrinking from 5404 to 5340 lines while moving OMO background-task diagnostics into `BackgroundTaskTimelineService`.
- Lane roadmap cites Task 3 key files as `OpenCodianView.ts`, `InputPanelAppearanceCoordinator.ts`, `ChatSelectionControlsCoordinator.ts`, `ConversationRenderService.ts`, with acceptance focused on explicit hotspot deltas and no new ownership pushed back into the view.

## Design Review Result

Verdict: PASS

Codex design review before app-code edits: the slice is queue-bound and measurable. The selected implementation must start from the listed shell-control owners and matching module docs, then choose one existing owner to absorb a durable view-local seam. The plan avoids new helper files, avoids `OpenCodeService.ts`, and requires targeted shell/render tests plus module-doc and graphify refreshes. Proceed with the smallest seam that reduces view-local assembly pressure and records before/after hotspot deltas.

## Implementation Summary

Packaged the input-panel glass-refraction CSS token refresh out of `OpenCodianView.applyChatAppearanceSettings()` and into the existing `InputPanelAppearanceCoordinator` owner. The coordinator already owned input-panel appearance sync, theme runtime delegation, sticky/color/layout follow-up, and liquid-glass diagnostics; it now also owns the matching chat-container CSS variable refresh for input-panel glass-refraction settings.

Hotspot deltas after implementation:

- `src/features/chat/OpenCodianView.ts`: 5340 lines -> 5321 lines (`-19`).
- `src/features/chat/OpenCodianView.ts`: import statements remain 88, but the view no longer imports `getInputPanelGlassRefractionCssVariables`, no longer directly writes input-panel glass-refraction CSS variables, and no longer carries two view-only forwarding wrappers for input-panel theme/diagnostics.
- `src/features/chat/services/InputPanelAppearanceCoordinator.ts`: 357 lines -> 376 lines, absorbing the durable multi-call appearance-refresh responsibility without creating a new file.
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`: unchanged at 447 lines / 10 imports.
- `src/features/chat/services/ConversationRenderService.ts`: unchanged at 277 lines / 9 imports.

## Files Changed

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/InputPanelAppearanceCoordinator.ts`
- `tests/unit/features/chat/InputPanelAppearanceCoordinator.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/InputPanelAppearanceCoordinator.md`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-phase-3.md`

## Validation

Targeted Task 3 validation:

- `npm test -- --runInBand tests/unit/features/chat/InputPanelAppearanceCoordinator.test.ts tests/unit/features/chat/modelSelectorDisplay.test.ts tests/unit/features/chat/modelSelectorInteractions.test.ts tests/unit/features/chat/ConversationRenderRuntime.test.ts` initially failed because the updated fixture did not expose `chatContainerEl` for the new assertion.
- The fixture was repaired, and the same targeted command passed: 4 suites, 14 tests.
- `npm test -- --runInBand tests/unit/features/chat/inputPanelTheme.test.ts tests/unit/features/chat/liquidGlassDiagnosticsLogging.test.ts tests/unit/features/chat/InputPanelAppearanceCoordinator.test.ts` initially exposed stale tests still calling removed view-private forwarding wrappers.
- Those tests were retargeted to `inputPanelAppearanceCoordinator`, and the same focused command passed: 3 suites, 14 tests.

Graph/module validation:

- `npm run graphify:update:src` passed and refreshed src-scoped graph artifacts.
- `npm run check:module-docs` passed: 372 source modules, 372 mapped docs, 2 required doc targets.
- `npm run check:graphify` passed for current `src` working-tree changes.

Configured validation:

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed after the focused stale-test repair: 339 suites, 1731 tests.
- `npm run build` passed with build id `autopilot-hotspot-core-packaging-review-loop.202604301901`.

Vulture validation is not configured for this round; no substitute was invented.

## Code Review Result

Verdict: PASS

Codex code review checked the full diff against H1 Task 3 acceptance criteria and project guardrails:

- Scope stays inside the queued chat shell-control slice; no H2 or unrelated chat runtime work was started.
- `OpenCodianView.ts` shrinks by 19 lines and no longer owns input-panel glass-refraction CSS variable assembly or view-private forwarding wrappers for input-panel theme/diagnostics.
- Ownership lands in the existing durable `InputPanelAppearanceCoordinator`, which already owns input-panel appearance sync, follow-up scheduling, and liquid-glass diagnostics.
- No new helper/adapter/provider/factory files were introduced, and no runtime ownership was pushed into `OpenCodeService.ts`.
- Focused tests were updated to call the coordinator seam rather than requiring view-private wrappers to remain, preserving the intended ownership reduction.
- Matching module docs, graphify artifacts, phase doc, and roadmap queue state were updated, and all configured validation commands passed.

## Outcome

Status: success. Completed roadmap queue item: `[DONE] Task 3 - Package chat shell control seams and checkpoint hotspot deltas`.

The H1 roadmap now has Task 1, Task 2, and Task 3 marked `[DONE]` with no remaining `[NEXT]` or `[QUEUED]` items. This round did not use background tasks, detached sub-work, OpenCode helpers, or deployment. Build ran, but deployment was not required because this was a packaging refactor plus docs/graphify/test updates without a requested Test Vault deployment.

## Next Recommended Slice

If validation and review pass, H1 has no remaining queued slices in this roadmap. Recommended next controller lane: `h2-opencode-runtime-package`.
