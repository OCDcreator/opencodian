## Round Design

- Exact `[NEXT]` slice: `Task 3 - Package local sidecar adopt/restart diagnostics` in lane `h2-opencode-runtime-package` (`H2 - Package the OpenCode service hotspot`).
- Goal: shrink a concentrated lifecycle/diagnostics slice in `ServerManager.ts` while preserving managed-sidecar adoption, stale restart, conflict detection, orphan recycle, and endpoint ownership semantics.
- Constraints and acceptance criteria: stay inside H2, execute only this queued slice, do not freestyle into another lane or round, keep `ServerManager.ts` losing a durable responsibility cluster without changing sidecar truth semantics, and keep adopt/restart/conflict coverage green.
- Targeted hotspot files and adjacent owners: `src/core/opencode/ServerManager.ts` is the hotspot; `src/core/opencode/LocalSidecarProcessInspector.ts` remains the OS-query owner; `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` is adjacent lifecycle context but should not receive this sidecar decision ownership unless needed.
- Intended before/after ownership surface: before, `ServerManager.ts` owns endpoint inspection, command-line classification, adopt/restart decisioning, orphan/conflict diagnostics builders, and conflict-message formatting in addition to lifecycle orchestration; after, a durable sidecar endpoint decision owner will hold command classification and occupied-endpoint resolution/diagnostic message assembly while `ServerManager.ts` remains the lifecycle executor that starts, stops, restarts, recycles, and mutates persisted managed state.
- Tests likely to change: add focused unit coverage for the new sidecar decision owner, then keep the configured lane tests green: `ServerManager.lifecycle`, `ServerManager.runtime`, `ServerManager.occupiedEndpoint`, and `LocalSidecarProcessInspector`.
- Docs likely to change: module docs for `ServerManager` and the new/changed sidecar owner, plus `docs/modules/core/opencode/index.md` or `docs/modules/README.md` if the module-doc guard requires an index mapping; refresh `graphify-out/` because `src/` changes are expected.
- Explicit non-goals: no changes to OpenCode process spawn semantics, shutdown semantics, HTTP health probing, SDK/chat behavior, settings UI, deployment, port defaults, auth headers, or Windows process-tree killing; do not add a thin wrapper that only forwards calls; do not push runtime ownership into `OpenCodeService.ts` or `OpenCodianView.ts`.

## Hotspot Baseline

- Lane docs identify `ServerManager.ts` as the local sidecar lifecycle, adopt/restart, and diagnostics hotspot, and Task 3 specifically targets managed-sidecar adoption, restart, conflict detection, and endpoint ownership semantics.
- Graph report evidence: `ServerManager` is a god-node candidate with `73` edges and appears as thin community `Community 13` with `74` nodes, including `.handleHealthyOccupiedLocalEndpoint()`, `.resolveOccupiedHealthyLocalEndpoint()`, `.tryAdoptManagedServer()`, `.getAdoptableManagedServerState()`, `.inspectExistingHealthyServer()`, `.looksLikeOpenCodeServeCommand()`, `.looksLikePluginManagedSidecarCommand()`, `.shouldRecycleUnknownLocalServer()`, `.buildHealthyLocalConflictDiagnostics()`, `.buildOrphanRestartDiagnostics()`, `.buildConflictMessage()`, and `.restartManagedServer()`.
- Fresh pre-refactor file metrics: `src/core/opencode/ServerManager.ts` has `1418` lines and `9` top-level imports; `src/core/opencode/LocalSidecarProcessInspector.ts` has `195` lines and `1` top-level import; `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts` has `515` lines and `4` top-level imports.
- Focused hotspot methods in `ServerManager.ts` before refactor: occupied-endpoint resolution and diagnostics span roughly lines `902-1140`, with adoption state helpers nearby at lines `833-899` and signature/config helpers at lines `1154-1237`.

## Design Review Result

- Verdict: PASS.
- Review notes: the selected seam is durable because occupied local endpoint resolution requires repeated command-line classification, diagnostics construction, and conflict-message policy, and it already has multiple callers/tests around adopt/restart/conflict/orphan behavior. Moving that policy into a dedicated sidecar endpoint resolver reduces `ServerManager.ts` decision and diagnostics ownership while preserving `ServerManager` as the lifecycle executor and `LocalSidecarProcessInspector` as the pure OS-query owner. The resolver will receive narrow callbacks for managed-state checks and clear-state side effects, so it does not own process shutdown, spawn, port waiting, status mutation, or persisted-state writing. Existing lane tests plus focused resolver tests provide coverage for the preserved truth semantics.

## Implementation Summary

- Added `LocalSidecarEndpointResolver` as the durable owner for local sidecar command classification, occupied healthy endpoint resolution, orphan-restart diagnostics, and conflict-message assembly.
- Kept `ServerManager` as the lifecycle executor: it still performs adopt state mutation, stale managed shutdown, orphan recycle shutdown, launch, status changes, and persisted managed-state updates.
- Rewired `ServerManager` to rebuild the resolver when server config changes and to delegate sidecar endpoint policy while preserving managed sidecar truth semantics.
- Added focused resolver tests and updated the occupied-endpoint tests to spy on the new resolver seam instead of the removed `ServerManager` private helper.
- Updated module docs, refreshed graphify artifacts, and marked H2 Task 3 complete in the lane roadmap.

## Files Changed

- `src/core/opencode/LocalSidecarEndpointResolver.ts`: new owner for sidecar endpoint command classification, adopt/restart/recycle/conflict resolution, and diagnostics/message formatting.
- `src/core/opencode/ServerManager.ts`: delegates occupied endpoint policy and diagnostics to `LocalSidecarEndpointResolver`, shrinking direct sidecar decision ownership while preserving lifecycle execution.
- `tests/unit/core/opencode/LocalSidecarEndpointResolver.test.ts`: covers plugin-managed command classification, conflict diagnostics/message generation, and orphan recycle eligibility.
- `tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`: updates the migrated test seam to use `endpointResolver.shouldRecycleUnknownLocalServer()`.
- `docs/modules/core/opencode/LocalSidecarEndpointResolver.md`: documents the new sidecar endpoint resolver owner and non-ownership boundaries.
- `docs/modules/core/opencode/ServerManager.md`: documents resolver delegation and the thinner ServerManager sidecar policy surface.
- `docs/modules/README.md`: adds the new module doc to the module tree.
- `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`: refreshed after `src/` changes.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-round-roadmap.md`: marks Task 3 `[DONE]`; no `[NEXT]` or `[QUEUED]` items remain in H2.
- `docs/status/lanes/h2-opencode-runtime-package/autopilot-phase-3.md`: records this round.

## Validation

- `npm test -- --runInBand tests/unit/core/opencode/LocalSidecarEndpointResolver.test.ts` — first run failed as expected before implementation because the resolver module did not exist.
- `npm test -- --runInBand tests/unit/core/opencode/LocalSidecarEndpointResolver.test.ts tests/unit/core/opencode/ServerManager.lifecycle.test.ts tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts` — first integrated run failed on one migrated private-method test seam; repaired by spying on the new resolver owner.
- `npm test -- --runInBand tests/unit/core/opencode/LocalSidecarEndpointResolver.test.ts tests/unit/core/opencode/ServerManager.lifecycle.test.ts tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts` — passed, 5 suites / 54 tests.
- `npm run graphify:update:src` — passed, rebuilt src graph and synced `graphify-out/` artifacts.
- `npm run check:module-docs` — passed, 373 source modules mapped and 1 required doc target satisfied.
- `npm run lint` — initially failed on import ordering in `ServerManager.occupiedEndpoint.test.ts`; `npx eslint tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts --fix` applied the focused repair.
- `npm run check:module-docs` — passed after repair.
- `npm run lint` — passed after repair.
- `npm run typecheck` — passed.
- `npm test` — passed, 340 suites / 1735 tests.
- `npm run build` — passed with `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604301948`.
- `npm run check:graphify` — passed.
- Vulture validation — not configured for this round; no substitute invented.

## Code Review Result

- Verdict: PASS.
- Review notes: the diff stays inside H2 Task 3 and does not start another lane or round. `ServerManager.ts` shrank from `1418` to `1298` lines while keeping lifecycle execution, shutdown, launch, status mutation, and managed-state persistence in place. The new `LocalSidecarEndpointResolver` owns a durable multi-call responsibility cluster rather than a thin forwarding helper: command classification, occupied endpoint resolution, orphan diagnostics, conflict diagnostics, and conflict messages. `LocalSidecarProcessInspector` remains the OS-query owner. Adopt/restart/conflict/orphan behavior is covered by the configured lane tests plus focused resolver tests, module docs are mapped, graphify is fresh, and all configured validation commands passed.

## Outcome

- Completed roadmap item: `[DONE] Task 3 - Package local sidecar adopt/restart diagnostics`.
- Hotspot delta: `ServerManager.ts` decreased from `1418` to `1298` lines; `LocalSidecarEndpointResolver.ts` now holds `165` lines of sidecar endpoint policy; `ServerManager.ts` top-level import count remains `9` because the settings constants import was replaced by resolver imports.
- Lane state: H2 now has Task 1, Task 2, and Task 3 marked `[DONE]`; no `[NEXT]` or `[QUEUED]` H2 items remain, so the controller can switch to `h3-settings-bootstrap-package`.
- Deployment: not run; this maintainability packaging slice changed core source and validation build artifacts were produced, but Test Vault deployment is not required by the configured deploy rules for this slice.

## Next Recommended Slice

- Switch to lane `h3-settings-bootstrap-package` and execute that lane's first `[NEXT]` item.
- Start from `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md`, its phase baseline, matching module docs, and the current graph report before touching settings/bootstrap source.
