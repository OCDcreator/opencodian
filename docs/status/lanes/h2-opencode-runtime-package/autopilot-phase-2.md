## Round Design

- Exact `[NEXT]` slice: Task 2 - Package stream and sync mutation ownership.
- Lane: `h2-opencode-runtime-package` (`H2 - Package the OpenCode service hotspot`).
- Goal: reduce direct stream/sync mutation pressure in `OpenCodeService.ts` by tightening ownership with the existing streaming and sync runtime coordinators.
- Constraints: execute only this queued slice; do not start Task 3 or any other lane; preserve SDK-first plus legacy fallback stream semantics; do not remove public service APIs; do not create thin helper/adapter/provider/factory files; do not move runtime ownership into `src/features/chat/OpenCodianView.ts` or add new service-facade logic.
- Acceptance criteria: stream and sync mutation assembly shifts toward existing coordinators, and stream/sync tests continue to cover SDK-first, legacy fallback, transformer, and sync-event behavior.
- Targeted hotspot files: `src/core/opencode/OpenCodeService.ts`, `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`, `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`, and `src/core/opencode/OpenCodeStreamEventTransformer.ts`.
- Adjacent owners: `OpenCodeSessionStateStore`, `OpenCodeSessionLifecycleCoordinator`, `OpenCodeQuestionPermissionHub`, `OpenCodeCatalogStateStore`, and `OpenCodeMessageNormalizationMapper` only through existing host seams.
- Before ownership surface: `OpenCodeService.ts` owns stream/sync coordinator construction plus direct mutation callback wiring, so service-local methods remain in the stream/sync mutation path even when existing coordinators already own ordering and application.
- Intended after ownership surface: keep transport routing and public facade delegation in `OpenCodeService.ts`, but move at least one durable stream/sync mutation seam from service-local wrapper methods into existing coordinator or store collaborators, reducing service line/import pressure without changing event semantics.
- Tests likely to change: add or tighten expectations in `tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts`, `tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts`, `tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts`, or `tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts` depending on the moved seam.
- Docs likely to change: update `docs/modules/core/opencode/OpenCodeService.md`, `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`, `docs/modules/core/opencode/OpenCodeSyncEventRuntimeCoordinator.md`, and/or `docs/modules/core/opencode/OpenCodeStreamEventTransformer.md`; refresh `graphify-out/` if `src/` changes.
- Explicit non-goals: no `ServerManager` packaging, no catalog/query redesign, no lifecycle/query/control changes from Task 1, no UI behavior changes, no deployment, no broad stream protocol rewrite, and no second roadmap item.

## Hotspot Baseline

- Lane baseline from `autopilot-phase-0.md`: `src/core/opencode/OpenCodeService.ts` was about `1867` lines, had `25` imports, and had `103` touches in the last 120 days.
- Previous phase baseline: Task 1 reduced `src/core/opencode/OpenCodeService.ts` from `1867` to `1866` lines while keeping `25` imports.
- Fresh local baseline before app-code edits: `src/core/opencode/OpenCodeService.ts` has `1866` lines and `25` top-level imports.
- Fresh local adjacent-owner baselines before app-code edits: `OpenCodeStreamingRuntimeCoordinator.ts` has `1254` lines and `6` top-level imports; `OpenCodeSyncEventRuntimeCoordinator.ts` has `528` lines and `3` top-level imports; `OpenCodeStreamEventTransformer.ts` has `1110` lines and `5` top-level imports.
- Graph report baseline: `graphify-out/GRAPH_REPORT.md` reports `OpenCodeStreamingRuntimeCoordinator` as a god-node candidate with `52` edges, while the stream and sync runtime communities are explicitly identified around `OpenCodeStreamingRuntimeCoordinator`, `OpenCodeSyncEventRuntimeCoordinator`, and `OpenCodeStreamEventTransformer`.

## Design Review Result

- Verdict: PASS.
- Review notes: the inspected stream/sync seam is durable and already belongs with existing owners: `OpenCodeStreamingRuntimeCoordinator` already orders stream mutations, while `OpenCodeSessionStateStore` owns canonical message/part graph mutation primitives. Moving `OpenCodeService.applyCanonicalStreamMutations()` and its helper merge/delta logic into `OpenCodeSessionStateStore.applyStreamMutations()` reduces service-local stream mutation ownership without creating new files, altering transport routing, or touching UI/runtime surfaces. The design preserves SDK-first plus legacy fallback behavior because the runtime coordinator still applies the same transformer-produced mutations in the same order; only the canonical graph application owner changes. Targeted store coverage plus the queued stream/sync tests provide an adequate safety net.

## Implementation Summary

- Moved stream canonical graph mutation application out of `OpenCodeService.ts` and into `OpenCodeSessionStateStore.applyStreamMutations()`.
- Kept `OpenCodeStreamingRuntimeCoordinator` as the ordering boundary that applies transformer-produced mutations before yielding legacy `StreamChunk` values.
- Preserved service-level assistant canonical diagnostics by logging each applied stream mutation after the store reducer runs.
- Added focused store coverage for stream message upsert, nested part merge, part delta append, and delta-first fallback part creation.
- Updated module docs, refreshed graphify artifacts, and advanced the H2 roadmap queue.

## Files Changed

- `src/core/opencode/OpenCodeService.ts`: delegates stream mutation reducer work to `OpenCodeSessionStateStore` and removes service-local stream merge/delta helper methods.
- `src/core/opencode/OpenCodeSessionStateStore.ts`: owns stream mutation application for message upsert, part upsert, nested defined-field merge, part delta append, and fallback part creation.
- `tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts`: covers the new stream mutation reducer seam.
- `docs/modules/core/opencode/OpenCodeService.md`: documents the thinner service stream mutation surface.
- `docs/modules/core/opencode/OpenCodeSessionStateStore.md`: documents stream mutation ownership in the canonical graph store.
- `docs/modules/core/opencode/OpenCodeStreamingRuntimeCoordinator.md`: documents coordinator ordering with store-owned mutation application.
- `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`: refreshed after `src/` changes.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-round-roadmap.md`: marks Task 2 `[DONE]` and promotes Task 3 to `[NEXT]`.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-phase-2.md`: records this round.

## Validation

- `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionStateStore.test.ts` — passed, 1 suite / 10 tests.
- `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts` — passed, 4 suites / 38 tests.
- `npm run check:module-docs` — passed, 372 source modules mapped and 2 required doc targets satisfied.
- `npm run lint` — initially failed on import sort plus one max-lines warning; focused repair applied.
- `npm run lint` — passed after repair.
- `npm run typecheck` — passed.
- `npm test` — passed, 339 suites / 1732 tests.
- `npm run build` — passed with `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604301931`.
- `npm run check:graphify` — passed.
- Vulture validation — not configured for this round; no substitute invented.

## Code Review Result

- Verdict: PASS.
- Review notes: the diff stays inside H2 Task 2 and does not start sidecar Task 3 implementation. No new thin helper files were added. `OpenCodeService.ts` shrank from `1866` to `1756` lines while preserving SDK-first plus legacy fallback stream behavior through the queued stream/sync tests. Stream mutation ordering remains in `OpenCodeStreamingRuntimeCoordinator`, canonical graph reducer ownership now sits in `OpenCodeSessionStateStore`, docs and graphify artifacts are current, and the roadmap queue has exactly Task 2 done with Task 3 next.

## Outcome

- Completed roadmap item: `[DONE] Task 2 - Package stream and sync mutation ownership`.
- Hotspot delta: `OpenCodeService.ts` decreased from `1866` to `1756` lines; its top-level import count stayed at `25`; `OpenCodeSessionStateStore.ts` increased to `309` lines and now owns stream mutation application.
- Deployment: not run; this maintainability packaging slice changed core source and build artifacts were produced for validation, but Test Vault deployment is not required by the configured deploy rules for this slice.

## Next Recommended Slice

- Execute the newly promoted `[NEXT]` item: Task 3 - Package local sidecar adopt/restart diagnostics.
- Focus on shrinking a durable lifecycle/diagnostics responsibility cluster in `ServerManager.ts` while preserving managed-sidecar adoption, restart, conflict detection, and endpoint ownership semantics.

