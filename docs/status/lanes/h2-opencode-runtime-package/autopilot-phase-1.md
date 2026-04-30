# Autopilot Phase 1 — `h2-opencode-runtime-package`

## Round Design

- Exact `[NEXT]` slice: Task 1 - Package `OpenCodeService` lifecycle/query/control assembly.
- Lane: `h2-opencode-runtime-package` / H2 - Package the OpenCode service hotspot.
- Goal: remove one stable lifecycle/query/control assembly slice from `OpenCodeService.ts` by strengthening existing coordinators instead of adding orchestration to the service facade.
- Constraints: execute only this queued slice; do not freestyle into streaming/sync or `ServerManager`; preserve SDK-first and legacy fallback CRUD, session control, and catalog query behavior; do not create thin helper/adapter/provider/factory files; do not push runtime ownership into `OpenCodianView.ts` or new service facade code.
- Acceptance criteria: `OpenCodeService.ts` line or import surface decreases measurably, and CRUD, session control, and catalog query flows remain covered by the queued targeted tests.
- Targeted hotspot files and adjacent owners: shrink `src/core/opencode/OpenCodeService.ts`; strengthen `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts` as the owner of session-message loading side effects; keep `src/core/opencode/OpenCodeSessionControlOrchestrator.ts` depending on adjacent owners through injected callbacks; leave `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` behavior unchanged except as needed by tests/docs.
- Before/after ownership surface: before, `OpenCodeService.getSessionMessages()` loads through `sessionLifecycle`, applies the canonical session snapshot itself, and is reused by session-control assembly callbacks; after, `OpenCodeSessionLifecycleCoordinator.getSessionMessages()` owns the complete message-load side effect sequence: SDK/legacy load, revert filtering, tool observation, and canonical snapshot application. `OpenCodeService.getSessionMessages()` becomes a pure public delegation seam, and session-control construction can depend directly on the lifecycle coordinator callback instead of routing through the service wrapper.
- Tests likely to change: add coordinator-level expectations to `tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts`; keep service CRUD/sync coverage in `tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts`; run the full queued targeted validation command.
- Docs likely to change: update `docs/modules/core/opencode/OpenCodeService.md` and `docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md`; refresh graphify because `src/` changes.
- Explicit non-goals: no stream/sync runtime changes, no `ServerManager` sidecar work, no catalog behavior redesign, no public API removal, no legacy fallback removal, no deployment, and no second roadmap item.

## Hotspot Baseline

- Lane baseline from `autopilot-phase-0.md`: `src/core/opencode/OpenCodeService.ts` is about `1867` lines, has `25` imports, and has `103` touches in the last 120 days.
- Lane baseline from `autopilot-phase-0.md`: `src/core/opencode/ServerManager.ts` is about `1418` lines and has `29` touches in the last 120 days; this round does not touch it because Task 1 is scoped to `OpenCodeService` lifecycle/query/control assembly.
- Fresh local baseline before app-code edits: `src/core/opencode/OpenCodeService.ts` has `1867` lines and `25` top-level imports.
- Fresh local adjacent-owner baselines before app-code edits: `OpenCodeSessionLifecycleCoordinator.ts` has `325` lines, `OpenCodeSessionControlOrchestrator.ts` has `531` lines, and `OpenCodeCatalogQueryCoordinator.ts` has `611` lines.
- Graph report baseline: `graphify-out/GRAPH_REPORT.md` reports the `src` graph at `356` files, `4699` nodes, `8732` edges, and `145` communities, confirming the core service remains part of a large graph where hotspot packaging matters.

## Design Review Result

- Verdict: PASS.
- Review notes: the design moves an existing durable side effect into the already-existing lifecycle coordinator instead of creating a new thin owner. It reduces service facade assembly by removing canonical snapshot responsibility from `OpenCodeService.getSessionMessages()` and by wiring session-control reads to the lifecycle/catalog owners directly. The scope is small enough for Task 1, leaves stream/sync and sidecar behavior untouched, and has direct targeted tests for the moved side effect plus the existing service CRUD/sync regression.

## Implementation Summary

- Moved authoritative session-message canonical snapshot application into `OpenCodeSessionLifecycleCoordinator.getSessionMessages()` for both SDK and legacy message loads.
- Kept `OpenCodeService.getSessionMessages()` as a public delegation wrapper, reducing the service's direct lifecycle side-effect assembly by one line and one responsibility cluster.
- Rewired `OpenCodeSessionControlOrchestrator` construction to read session messages directly from `sessionLifecycle` and available models directly from `catalogQueries`, avoiding service-wrapper recursion for this lifecycle/query/control assembly seam.
- Added coordinator test coverage proving filtered message loads now trigger canonical snapshot application before returning.
- Updated module docs and refreshed `src` graphify artifacts.

## Files Changed

- `src/core/opencode/OpenCodeService.ts`: delegates message loading fully to `sessionLifecycle` and wires session-control callbacks to adjacent owners.
- `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`: owns canonical snapshot application after SDK/legacy message load, revert filtering, and tool observation.
- `tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts`: asserts lifecycle message loading applies the canonical snapshot with filtered messages.
- `docs/modules/core/opencode/OpenCodeService.md`: documents the thinner public wrapper and lifecycle-owned message-load side effects.
- `docs/modules/core/opencode/OpenCodeSessionLifecycleCoordinator.md`: documents canonical snapshot ownership in the lifecycle coordinator host seam.
- `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`: refreshed after `src/` changes.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-round-roadmap.md`: marks Task 1 `[DONE]` and promotes Task 2 to `[NEXT]`.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-phase-1.md`: records this round.

## Validation

- `npm test -- --runInBand tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts` — passed, 4 suites / 32 tests.
- `npm run check:module-docs` — passed, 372 source modules mapped and 2 required doc targets satisfied.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, 339 suites / 1731 tests.
- `npm run build` — passed with `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604301910`.
- `npm run check:graphify` — passed.
- Vulture validation — not configured for this round; no substitute invented.

## Code Review Result

- Verdict: PASS.
- Review notes: the diff stays inside H2 Task 1 and does not touch stream/sync or `ServerManager` ownership. No new helper files were added. `OpenCodeService.ts` line count decreased from `1867` to `1866` while its public behavior remains covered by the queued service/coordinator tests. The lifecycle coordinator now owns the full message-load side effect sequence without changing SDK-first or legacy fallback semantics. Module docs, graphify artifacts, roadmap state, and phase artifacts are present.

## Outcome

- Completed roadmap item: `[DONE] Task 1 - Package OpenCodeService lifecycle/query/control assembly`.
- Hotspot delta: `OpenCodeService.ts` decreased from `1867` to `1866` lines; import count remains `25`; lifecycle message-load canonical snapshot responsibility moved to `OpenCodeSessionLifecycleCoordinator`.
- Deployment: not run; this round changed core/runtime source and build artifacts were produced for validation, but the configured deployment rules do not require Test Vault deployment for this maintainability packaging slice.

## Next Recommended Slice

- Execute the newly promoted `[NEXT]` item: Task 2 - Package stream and sync mutation ownership.
- Focus on reducing direct stream/sync mutation pressure in `OpenCodeService.ts` by tightening ownership in `OpenCodeStreamingRuntimeCoordinator`, `OpenCodeSyncEventRuntimeCoordinator`, and `OpenCodeStreamEventTransformer` while preserving SDK-first plus legacy fallback semantics.
