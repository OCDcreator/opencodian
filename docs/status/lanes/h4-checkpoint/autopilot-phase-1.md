# Autopilot Phase 1 — `h4-checkpoint`

## Round Design

Exact `[NEXT]` slice: `Task 1 - Recompute hotspot metrics and close residual thin seams` from `docs/status/lanes/h4-checkpoint/autopilot-round-roadmap.md`.

Lane: `h4-checkpoint` (`H4 - Hotspot checkpoint and closeout`). Goal: re-measure hotspot files, verify that the H1-H3 packaging rounds produced real ownership shrinkage, and remove only residual thin seams that block a clean checkpoint. Constraints: execute only this queued slice, do not start Task 2, do not freestyle outside the queue, do not introduce new runtime ownership in `OpenCodianView.ts` or `OpenCodeService.ts`, and keep cleanup tightly bounded to checkpoint purpose. Acceptance criteria: fresh hotspot evidence is recorded here, residual cleanup stays bounded, and `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.

Targeted hotspot files and adjacent owners:

- `src/features/chat/OpenCodianView.ts`: current largest chat hotspot; should lose one review-marked compatibility seam/import rather than gain new logic.
- `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`: residual thin regrouping seam documented as `[REVIEW]` and described as only forwarding fingerprint calculation/writeback.
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`: existing durable multi-call runtime owner that already consumes the tab fingerprint writeback port and can own the shared runtime port type without a separate provider file.
- `src/features/chat/services/PersistentAssistantNoticeService.ts`: existing durable consumer of the fingerprint runtime port; should import the type from the durable bundle after the seam is removed.
- Matching tests/docs: remove or migrate `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts`, update `PersistentAssistantNoticeService` and question/todo background-task support imports if needed, and refresh module docs plus graphify because `src/` changes.

Before ownership surface: `OpenCodianView.createConversationRuntimeWiring()` imports `createTabConversationSyncFingerprintRuntimePort`, constructs a pass-through runtime port through `createTabConversationSyncFingerprintPortProviderHost()`, stores it, and gives that port to persistent assistant notices and the question/todo/background-task runtime bundle. The provider module itself has no business behavior beyond forwarding two host functions and is explicitly documented as a very thin regrouping seam under `[REVIEW]`.

After ownership surface: `OpenCodianView` will construct the same small runtime port inline at the surface where the underlying view methods already live, while the reusable `TabConversationSyncFingerprintRuntimePort` contract moves into `QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`, the existing durable owner that needs the shared writeback type. `PersistentAssistantNoticeService` will consume that type from the durable bundle. The standalone provider file and its test/doc can be removed, reducing residual thin seam debris without changing sync semantics.

Tests and docs likely to change:

- `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.testSupport.ts`
- `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts` deletion if the seam is removed
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`
- `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md` deletion if the source module is removed
- `docs/modules/README.md` or generated module indexes only if the module-doc guard reports them stale
- `graphify-out/**` after `npm run graphify:update:src`

Explicit non-goals:

- Do not alter conversation sync algorithms, background task refresh order, persistent notice append/dedupe behavior, tab activation, or server/session runtime behavior.
- Do not add new helper, adapter, provider, factory, or barrel files.
- Do not touch `reference-projects/`.
- Do not modify deployment artifacts or run Test Vault deployment; this slice does not target deploy-relevant runtime assets beyond source refactoring.
- Do not invent another H4 task or start Task 2.

## Hotspot Baseline

Lane and prior phase evidence before app-code edits:

- H1 phase 0 baseline cited `src/features/chat/OpenCodianView.ts` at about `5418` lines, `91` imports, and `306` touches in the prior 120 days.
- Current checkpoint measurement: `src/features/chat/OpenCodianView.ts` is `5321` lines, `88` imports, and `311` commits in the last 120 days.
- H2 phase docs reduced `src/core/opencode/OpenCodeService.ts` from the inherited hotspot into the current `1756` lines, `25` imports, and `105` commits in the last 120 days.
- Current checkpoint measurement: `src/core/opencode/ServerManager.ts` is `1298` lines, `9` imports, and `30` commits in the last 120 days.
- H3 phase docs reduced `src/features/settings/SettingsModelCatalogPresenter.ts` to `1043` lines after extracting availability descriptors, while `src/features/settings/OpenCodianSettings.ts` is now `483` lines.
- Current checkpoint measurement: `src/main.ts` is `1417` lines, `17` imports, and `69` commits in the last 120 days.
- Residual seam evidence: `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts` is `26` lines, has a dedicated pass-through test, and its module doc says it is a "very thin runtime port regrouping seam" whose boundary is still `[REVIEW]`.

## Design Review Result

Verdict: PASS.

Review: The design matches H4 Task 1 because it first records fresh hotspot line/import/churn evidence, then limits code changes to one documented residual thin seam. Removing `TabConversationSyncFingerprintPortProvider.ts` does not push runtime behavior into `OpenCodianView.ts`; it removes an anemic pass-through file and keeps the shared type with the already durable question/todo/background-task runtime bundle. The persistent notice service and runtime bundle keep the same ports and call order, so the planned targeted test migration plus full lint/typecheck/test/build gates are sufficient for this bounded checkpoint cleanup. Proceed with the smallest patch and do not start H4 Task 2.


## Implementation Summary

Removed the residual `TabConversationSyncFingerprintPortProvider` pass-through seam after recomputing checkpoint hotspot metrics. `OpenCodianView` now creates the same `TabConversationSyncFingerprintRuntimePort` directly at the surface runtime boundary, while the reusable port type lives with the durable `QuestionTodoBackgroundTaskRuntimeServiceBundle` owner that already consumes the tab-scoped fingerprint writeback contract. `PersistentAssistantNoticeService` continues to consume the same runtime port contract for persisted notice append/save/fingerprint follow-up.

Hotspot deltas after implementation:

- `src/features/chat/OpenCodianView.ts`: `5321` lines / `88` imports before → `5314` lines / `87` imports after.
- `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`: `26`-line pass-through provider removed.
- `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts`: dedicated pass-through test removed because the seam no longer exists.
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`: `234` lines / `7` imports before → `242` lines / `8` imports after, absorbing the shared port type without changing bundle orchestration.
- Graphify changed from `4716` nodes / `8733` edges / `144` communities to `4714` nodes / `8731` edges / `185` communities after the source-scoped refresh.

## Files Changed

- `src/features/chat/OpenCodianView.ts`: removed the provider import and host factory, and now creates the fingerprint runtime port directly from existing view methods.
- `src/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.ts`: owns the shared `TabConversationSyncFingerprintRuntimePort` contract used by question/todo/background-task and persisted notice flows.
- `src/features/chat/services/PersistentAssistantNoticeService.ts`: imports the shared fingerprint runtime port from the durable runtime bundle.
- `src/features/chat/services/TabConversationSyncFingerprintPortProvider.ts`: deleted the residual thin pass-through seam.
- `tests/unit/features/chat/PersistentAssistantNoticeService.test.ts`: migrated the shared port type import.
- `tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.testSupport.ts`: migrated and sorted the shared port type import.
- `tests/unit/features/chat/TabConversationSyncFingerprintPortProvider.test.ts`: deleted the obsolete pass-through test.
- `docs/modules/features/chat/OpenCodianView.md`: documented that the fingerprint port no longer goes through a separate provider.
- `docs/modules/features/chat/services/QuestionTodoBackgroundTaskRuntimeServiceBundle.md`: documented the shared fingerprint port boundary.
- `docs/modules/features/chat/services/PersistentAssistantNoticeService.md`: documented direct consumption of the shared runtime port.
- `docs/modules/features/chat/services/TabConversationSyncFingerprintPortProvider.md`: deleted the module doc with the deleted source module.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`: refreshed after `src/` changes.
- `docs/status/lanes/h4-checkpoint/autopilot-round-roadmap.md`: marked Task 1 done and promoted Task 2 to `[NEXT]`.
- `docs/status/lanes/h4-checkpoint/autopilot-phase-1.md`: recorded this round's design, evidence, validation, and review.

## Validation

- `npm test -- --runInBand tests/unit/features/chat/PersistentAssistantNoticeService.test.ts tests/unit/features/chat/QuestionTodoBackgroundTaskRuntimeViewHosts.test.ts` — PASS, 2 suites / 6 tests.
- `npm run check:module-docs` — PASS.
- `npm run graphify:update:src` — PASS; refreshed committed graphify artifacts.
- `npm run lint` — initially failed on one sorted-import issue in `QuestionTodoBackgroundTaskRuntimeViewHosts.testSupport.ts`; fixed the import grouping.
- `npm run lint` — PASS after the focused repair.
- `npm run typecheck` — PASS.
- `npm test` — PASS, 340 suites / 1739 tests; Node emitted the existing `--localstorage-file` warning without failing tests.
- `npm run build` — PASS; BUILD_ID `autopilot-hotspot-core-packaging-review-loop.202604302121`.
- `npm run check:graphify` — PASS.
- Vulture validation command is blank in this round configuration, so no substitute command was run.

## Code Review Result

Verdict: PASS.

Review: The diff implements only H4 Task 1. Fresh hotspot metrics are recorded, the cleanup removes one documented `[REVIEW]` thin pass-through provider instead of creating a new helper, and `OpenCodianView.ts` loses both line and import surface. The moved type lands in an existing durable runtime bundle that already owns the question/todo/background-task conversation-sync writeback seam; `PersistentAssistantNoticeService` behavior remains unchanged because it still receives the same `getConversationSyncFingerprint` and `setTabConversationSyncFingerprint` functions. Module docs and graphify artifacts match the source boundary changes, the roadmap advances exactly one item, and all configured validation gates passed after the single focused lint repair. No background or detached work was used.

## Outcome

Status: success. Completed roadmap queue item: `[DONE] Task 1 - Recompute hotspot metrics and close residual thin seams`.

The checkpoint lane now has fresh hotspot evidence and one less residual thin seam. Task 2 is promoted to `[NEXT]` for the final checkpoint summary and queue stop.

## Next Recommended Slice

Execute only `h4-checkpoint` Task 2: write the final checkpoint summary and stop the queue cleanly. Start from `docs/archive/maintainability/autopilot/autopilot-master-plan.md`, `docs/archive/maintainability/autopilot/autopilot-lane-map.md`, and the H1-H4 phase docs; avoid new code changes unless a final checkpoint cleanup strictly requires them.
