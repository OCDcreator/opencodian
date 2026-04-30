## Round Design

Exact `[NEXT]` slice: Task 2 - Package question and background-task orchestration out of `OpenCodianView`.

Lane: `h1-chat-runtime-package` (`H1 - Package the chat runtime hotspot`). Goal: remove one stable question/background-task orchestration cluster from `OpenCodianView.ts` by strengthening existing runtime owners around question refresh, reminder fallback, and inline completion state. Constraints: execute only this queued slice, do not start Task 3, introduce no new thin wrapper files, do not add runtime ownership to `OpenCodianView.ts` or `OpenCodeService.ts`, and preserve question resolution plus background completion notice semantics. Acceptance criteria: view-local orchestration shrinks measurably without regressing question resolution or background completion notices, and ownership lands in existing chat owners or a durable multi-call owner.

Targeted hotspot files and adjacent owners:

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/QuestionDockCoordinator.ts`
- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`
- Matching unit tests and module docs for these files

Before/after ownership surface intended to shrink:

- Before: `OpenCodianView.ts` still coordinates multiple question/background-task seams directly while adjacent owners handle narrower pieces.
- After: an existing adjacent owner should absorb one repeated orchestration seam so the view calls fewer direct helper methods or imports fewer direct dependencies for question refresh, reminder fallback, or completion state.

Tests and docs likely to change:

- Targeted validation: `npm test -- --runInBand tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- Module docs for `OpenCodianView`, `QuestionDockCoordinator`, `BackgroundTaskTimelineService`, and/or `BackgroundTaskCompletionNoticeService` depending on the final ownership move.
- `graphify-out/**` after any `src/` edits.

Explicit non-goals:

- Do not alter Task 3 shell input/selection/render-refresh seams.
- Do not change OpenCode service runtime ownership or background task protocol semantics.
- Do not introduce a new helper/factory solely to reduce line count.
- Do not deploy to the Test Vault unless a deploy-relevant runtime path unexpectedly requires it.

## Hotspot Baseline

Current baseline before app-code edits:

- `src/features/chat/OpenCodianView.ts`: 5404 lines, 88 import statements.
- `src/features/chat/services/QuestionDockCoordinator.ts`: 501 lines, 11 import statements.
- `src/features/chat/services/BackgroundTaskTimelineService.ts`: 286 lines, 4 import statements.
- `src/features/chat/services/BackgroundTaskCompletionNoticeService.ts`: 224 lines, 4 import statements.
- Lane roadmap cites Task 2 key files as `OpenCodianView.ts`, `QuestionDockCoordinator.ts`, `BackgroundTaskTimelineService.ts`, `BackgroundTaskCompletionNoticeService.ts`, with acceptance focused on shrinking view-local orchestration while preserving question resolution and background completion notices.

## Design Review Result

Verdict: PASS

Codex design review before app-code edits: the planned slice is small and queue-bound. The search surface starts from the roadmap, phase 1 handoff, graph report, and matching module docs, then narrows to the question/background-task seams only. The preferred implementation path is to strengthen one of the existing multi-call owners (`QuestionDockCoordinator`, `BackgroundTaskTimelineService`, or `BackgroundTaskCompletionNoticeService`) rather than create a new file. The acceptance check is measurable `OpenCodianView.ts` line/import or orchestration reduction plus targeted tests for question dock, question host adapter, background completion notices, and timeline behavior. Proceed.

## Implementation Summary

Packaged the OMO background-task diagnostics logging seam out of `OpenCodianView.ts` and into the existing `BackgroundTaskTimelineService` owner. The timeline service already owns background-task segment assembly, diagnostics snapshots, runtime rebuild, and inline copy; it now also owns the per-conversation diagnostic logging state that dedupes pending/completed OMO background-task logs.

Hotspot deltas after implementation:

- `src/features/chat/OpenCodianView.ts`: 5404 lines -> 5340 lines (`-64`).
- `src/features/chat/OpenCodianView.ts`: import statements remain 88, but the view no longer declares `OmoBackgroundTaskLogState`, no longer stores `omoBackgroundTaskLogStates`, and no longer directly computes diagnostics/logging transitions.
- `src/features/chat/services/BackgroundTaskTimelineService.ts`: 286 lines -> 377 lines, absorbing the durable multi-call diagnostics logging responsibility without introducing a new file.

The question/background-task lane behavior remains delegated to existing owners: question refresh/resolution remains in `QuestionDockCoordinator`, completion notices remain in `BackgroundTaskCompletionNoticeService`, and OMO timeline diagnostics now sit beside the segment/diagnostics APIs they consume.

## Files Changed

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/BackgroundTaskTimelineService.ts`
- `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/BackgroundTaskTimelineService.md`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-round-roadmap.md`
- `docs/status/lanes/h1-chat-runtime-package/autopilot-phase-2.md`

## Validation

Targeted TDD and lane validation:

- `npm test -- --runInBand tests/unit/features/chat/backgroundTaskTimeline.test.ts` failed first as expected because `BackgroundTaskTimelineService.logOmoBackgroundTaskDiagnostics` did not exist.
- `npm test -- --runInBand tests/unit/features/chat/backgroundTaskTimeline.test.ts` passed after implementation: 4 tests passed.
- `npm test -- --runInBand tests/unit/features/chat/QuestionDockCoordinator.test.ts tests/unit/features/chat/QuestionRuntimeHostAdapter.test.ts tests/unit/features/chat/BackgroundTaskCompletionNoticeService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts` passed: 4 suites, 19 tests.

Configured validation:

- `npm run check:module-docs` passed.
- `npm run graphify:update:src` passed and refreshed src-scoped graph artifacts.
- `npm run check:graphify` passed after the final graphify refresh.
- `npm run lint` initially failed on import sort and a max-lines-per-function warning; a focused test/helper cleanup plus `npx eslint src/features/chat/services/BackgroundTaskTimelineService.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts --fix` repaired it. Final `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test` passed: 339 suites and 1731 tests.
- `npm run build` passed with build id `autopilot-hotspot-core-packaging-review-loop.202604301846`.

Vulture validation is not configured for this round; no substitute was invented.

## Code Review Result

Verdict: PASS

Codex code review checked the full diff against the H1 Task 2 acceptance criteria and project guardrails:

- Scope stays inside the queued question/background-task orchestration slice; Task 3 shell input/selection/render refresh was not started.
- `OpenCodianView.ts` shrinks by 64 lines and no longer directly owns OMO background-task diagnostic logging state or transition computation.
- Ownership lands in the existing durable `BackgroundTaskTimelineService`, which already owns background-task diagnostics snapshots and timeline assembly, rather than in a new thin helper file.
- Question resolution and completion notice ownership remain with their existing owners; targeted tests covering `QuestionDockCoordinator`, `QuestionRuntimeHostAdapter`, `BackgroundTaskCompletionNoticeService`, and background timeline behavior pass.
- Matching module docs and graphify artifacts were refreshed, and all configured validation commands passed.

## Outcome

Status: success. Completed roadmap queue item: `[DONE] Task 2 - Package question and background-task orchestration out of OpenCodianView`.

The roadmap now promotes Task 3 to `[NEXT]`. This round did not use background tasks, detached sub-work, OpenCode helpers, or deployment. Build ran, but deployment was not required because this was a packaging refactor plus docs/graphify/test updates without a requested Test Vault deployment.

## Next Recommended Slice

Next lane item: `[NEXT] Task 3 - Package chat shell control seams and checkpoint hotspot deltas`.

Recommended starting point: read the module docs for `InputPanelAppearanceCoordinator`, `ChatSelectionControlsCoordinator`, `ConversationRenderService`, and the relevant `OpenCodianView` shell-control seams before touching source. Preserve the lane handoff requirement to document explicit before/after hotspot deltas.
