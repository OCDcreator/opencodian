# Autopilot Phase 1 — `h1-chat-runtime-package`

## Round Design

Exact `[NEXT]` slice: Task 1 - Package `OpenCodianView` hydration and activation assembly.

Lane: `h1-chat-runtime-package` (`H1 - Package the chat runtime hotspot`). Goal: move one durable hydration/activation assembly slice out of `OpenCodianView.ts` into existing chat runtime owners so the view stops directly coordinating as many transition details. Constraints: execute only this queued slice, introduce no new thin wrapper files, do not add runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`, preserve hydration/auth-sync, tab activation, and conversation load semantics. Acceptance criteria: `OpenCodianView.ts` line or import surface decreases measurably; existing chat runtime owners absorb the responsibility; targeted hydration/activation tests remain behavior-equivalent.

Targeted hotspot files and adjacent owners:

- `src/features/chat/OpenCodianView.ts`: current hotspot and assembly caller to shrink.
- `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`: existing durable owner for deriving hydration/transition/outcome hosts from the view seam; strengthen it to own hydration bridge construction.
- `src/features/chat/runtime/ConversationHydrationRenderBridge.ts`, `src/features/chat/runtime/ConversationTransitionBridge.ts`, and `src/features/chat/runtime/ConversationHydrationOutcomeBridge.ts`: runtime bridge classes whose direct import/construction can move out of the view.
- `src/features/chat/services/ConversationViewStateService.ts`, `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`, and `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`: downstream activation/load owners that must keep their behavior and ports unchanged.
- Matching tests/docs: hydration runtime host factory test, targeted lane tests, and module docs for the changed owner and `OpenCodianView`.

Before ownership surface: `OpenCodianView.createConversationRuntimeWiring()` directly imports and constructs `ConversationHydrationRenderBridge`, `ConversationTransitionBridge`, and `ConversationHydrationOutcomeBridge`, then passes the three resulting instances into activation/load orchestration.

After ownership surface: `OpenCodianView.createConversationRuntimeWiring()` still supplies the real view host seam and downstream activation dependencies, but the existing `ConversationHydrationRuntimeViewHostFactory` owns the repeated hydration bridge assembly and returns the bridge instances as one packaged runtime bundle. The view loses direct imports and constructor calls for these bridge classes while retaining true DOM/state implementations.

Tests likely to change:

- Extend `tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts` first to assert the factory can build the runtime bridge bundle and preserve transition/outcome behavior.
- Run the lane-targeted validation command after implementation.

Docs likely to change:

- `docs/modules/features/chat/services/ConversationHydrationRuntimeViewHostFactory.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md`
- this phase doc

Explicit non-goals:

- Do not change conversation load branch decisions, sync/auth behavior, scroll restore semantics, tab activation flow, or background-task/question/todo outcomes.
- Do not create a new helper/factory file; strengthen the existing hydration runtime host factory.
- Do not move any new runtime ownership into `OpenCodianView.ts`, `OpenCodeService.ts`, or `main.ts`.
- Do not execute Task 2 or Task 3 from the lane queue.

## Hotspot Baseline

Lane phase 0 cites `src/features/chat/OpenCodianView.ts` as the primary hotspot at about `5418` lines, `91` imports, and `306` touches in the last 120 days. Current local measurements before app-code edits confirm:

- `src/features/chat/OpenCodianView.ts`: `5418` lines via `wc -l`
- `src/features/chat/OpenCodianView.ts`: `91` top-level import statements via `rg -n '^import ' ... | wc -l`
- Adjacent owner sizes before this round:
  - `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`: `82` lines
  - `src/features/chat/services/ConversationLoadRecoveryCoordinator.ts`: `372` lines
  - `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`: `518` lines
  - `src/features/chat/runtime/ConversationTransitionBridge.ts`: `85` lines
  - `src/features/chat/runtime/ConversationHydrationOutcomeBridge.ts`: `54` lines
  - `src/features/chat/services/ConversationViewStateService.ts`: `203` lines

## Design Review Result

Verdict: PASS

Codex design review: The planned slice matches the queued H1 Task 1 scope because it packages hydration/activation assembly currently owned by `OpenCodianView.ts` without changing the underlying transition, outcome, load, or tab activation semantics. It strengthens an existing multi-call owner (`ConversationHydrationRuntimeViewHostFactory`) that already maps the flattened view seam into hydration/transition/outcome bridge hosts, so it is not a new thin wrapper. The refactor should reduce the view import surface and constructor pressure while preserving behavior through existing bridge classes and targeted tests. Proceed with TDD by adding a failing factory-level test before production changes.

## Implementation Summary

Packaged the hydration bridge construction slice out of `OpenCodianView.createConversationRuntimeWiring()` and into the existing `ConversationHydrationRuntimeViewHostFactory` owner. The factory now exposes `createConversationHydrationRuntimeBridges()`, which derives the existing render/transition/outcome hosts from the flattened view seam and constructs `ConversationHydrationRenderBridge`, `ConversationTransitionBridge`, and `ConversationHydrationOutcomeBridge` in one durable bundle.

Hotspot deltas after implementation:

- `src/features/chat/OpenCodianView.ts`: `5418` lines → `5403` lines (`-15`)
- `src/features/chat/OpenCodianView.ts`: `91` import statements → `88` import statements (`-3`)
- `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`: `82` lines → `143` lines, absorbing the bridge construction responsibility without introducing a new file

The hydration/auth-sync, tab activation, and conversation load semantics remain delegated to the same runtime bridge classes and coordinators; only the assembly boundary moved.

## Files Changed

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ConversationHydrationRuntimeViewHostFactory.ts`
- `tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationHydrationRuntimeViewHostFactory.md`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-phase-1.md`

## Validation

Targeted TDD and lane validation so far:

- `npm test -- --runInBand tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts` initially failed as expected because `createConversationHydrationRuntimeBridges` did not exist.
- `npm test -- --runInBand tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts` passed after implementation: 3 tests passed.
- `npm test -- --runInBand tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts tests/unit/features/chat/ConversationTabRuntimeCoordinator.test.ts tests/unit/features/chat/ConversationTransitionBridge.test.ts tests/unit/features/chat/ConversationHydrationOutcomeBridge.test.ts` passed: 4 suites, 21 tests.

Configured validation still to run after docs/graphify refresh:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Vulture validation is not configured for this round; no substitute was invented.
- `npm run graphify:update:src` initially failed because no Python interpreter had `graphify` installed. Created the repo-local `.graphify-venv` with `python3.13 -m venv .graphify-venv && .graphify-venv/bin/pip install graphifyy`, then reran `npm run graphify:update:src` successfully.
- `npm run lint` initially failed on import sort in the new test; `npx eslint tests/unit/features/chat/ConversationHydrationRuntimeViewHostFactory.test.ts --fix` repaired it.
- `npm run typecheck` initially failed because `OpenCodianView.ts` still used removed bridge import names in type positions; the view now refers to `ConversationHydrationRuntimeBridges[...]` for those bridge instance types.
- `npm run lint && npm run verify` initially failed on `OpenCodianView.ts` import sort after the type import change; `npx eslint src/features/chat/OpenCodianView.ts --fix` repaired it.
- Final `npm run lint && npm run verify` passed. `npm run verify` covered module-docs, graphify freshness, devlog order, lint, typecheck, full tests, and production build. Final full-test count: 339 suites and 1730 tests passed. Final build id: `autopilot-hotspot-core-packaging-review-loop.202604301813`.

## Code Review Result

Verdict: PASS

Codex code review checked the full diff against the H1 Task 1 acceptance criteria and project guardrails:

- Scope stays inside the queued hydration/activation assembly slice; Task 2 and Task 3 were not started.
- `OpenCodianView.ts` shrinks by line count and import surface (`5418` → `5404` lines, `91` → `88` imports) and no longer imports or manually constructs the three hydration bridge classes.
- No new files or thin wrappers were introduced; the existing durable `ConversationHydrationRuntimeViewHostFactory` now owns host derivation plus bridge construction.
- Hydration/auth-sync, tab activation, and conversation load semantics remain behavior-equivalent because the same bridge classes and downstream coordinators are used with the same host seams.
- Matching module docs and graphify artifacts were refreshed, and all configured gates passed.

## Outcome

Status: success. Completed roadmap queue item: `[DONE] Task 1 - Package OpenCodianView hydration and activation assembly`.

The roadmap now promotes Task 2 to `[NEXT]` and leaves Task 3 queued. This round did not use background tasks, detached sub-work, OpenCode helpers, or deployment. Build ran, but deployment was not required because this was a packaging refactor plus docs/graphify/test updates without a requested Test Vault deployment.

## Next Recommended Slice

Next lane item: `[NEXT] Task 2 - Package question and background-task orchestration out of OpenCodianView`.

Recommended starting point: read the Task 2 module docs for `QuestionDockCoordinator`, `BackgroundTaskTimelineService`, `BackgroundTaskCompletionNoticeService`, and the relevant `OpenCodianView` question/background-task seams before touching source.
