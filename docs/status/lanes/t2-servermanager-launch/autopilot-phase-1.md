# Autopilot Phase 1 — `t2-servermanager-launch`

## Round Design

- **Queued slice (`[NEXT]`)**: Task 1 - package `ServerManager` local sidecar launch context into `LocalSidecarLauncher`.
- **Goal restatement**: move spawn, launch tracking, launch failure assembly, and health-ready waiting out of `src/core/opencode/ServerManager.ts` into one durable adjacent owner while keeping `ServerManager` as lifecycle/state owner.
- **Targeted hotspot files / adjacent owners**:
  - `src/core/opencode/ServerManager.ts` (hotspot owner to thin)
  - `src/core/opencode/LocalSidecarLauncher.ts` (new adjacent launch-context owner)
  - `src/core/opencode/index.ts` (owner export surface)
  - `tests/unit/core/opencode/ServerManager.runtime.test.ts`
  - `tests/unit/core/opencode/ServerManager.lifecycle.test.ts`
  - `tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts` (only if seam wiring impacts launch calls)
  - `docs/modules/core/opencode/ServerManager.md`
  - `docs/modules/core/opencode/LocalSidecarLauncher.md` (new module doc)
  - `docs/modules/core/opencode/index.md`
- **Before/after ownership surface**:
  - Before: `ServerManager` owns lifecycle/state decisions and the local launch runtime internals (spawn wiring, output-tail tracking, launch failure diagnostics, wait-for-healthy loop orchestration).
  - After: `ServerManager` keeps lifecycle/status/managed-state/adopt-restart/conflict decisions; `LocalSidecarLauncher` owns launch-context runtime mechanics and exposes cohesive launch operations + snapshots to `ServerManager`.
- **Likely tests/docs to change**:
  - Launch runtime seam tests in `ServerManager.runtime.test.ts`.
  - Lifecycle test access typing in `ServerManager.lifecycle.test.ts` if private launch method names change.
  - Module docs for `ServerManager` and new launch owner.
- **Explicit non-goals**:
  - No changes to `src/main.ts`, `src/features/chat/OpenCodianView.ts`, `src/core/opencode/OpenCodeService.ts`.
  - No changes to sidecar endpoint truth semantics (`LocalSidecarEndpointResolver`) or process/port probe primitives (`LocalProcessProbe`) beyond launch wiring.
  - No deploy/test-vault flow changes.

## Hotspot Baseline

- `src/core/opencode/ServerManager.ts`: **1167 lines**, **8 imports** (`wc -l`, `rg '^import '`).
- Adjacent owners currently in lane scope:
  - `src/core/opencode/LocalSidecarProcessInspector.ts`: 384 lines
  - `src/core/opencode/LocalSidecarEndpointResolver.ts`: 165 lines
- Recent hotspot churn confirms prior seam landed and this lane is next:
  - `43ebaf0b autopilot: round 2 - extract servermanager local process probe seam`
  - task queue still marks launch-context seam as `[NEXT]` in this lane roadmap.

## Design Review Result

- **Verdict**: PASS
- **Why this is ready**:
  - The extraction seam matches the roadmap acceptance exactly (launch-context ownership only).
  - `ServerManager` lifecycle/state truth remains in place.
  - The new owner is cohesive (spawn + launch tracking + wait/timeout + failure context), not a thin forwarding wrapper.
  - Validation path is predeclared: targeted lane tests first, then graph/module-doc/verify gates.

## Implementation Summary

- Added `src/core/opencode/LocalSidecarLauncher.ts` as the new launch-context owner for:
  - OpenCode binary resolution
  - spawn env preparation / sanitization
  - child-process launch tracking (stdout/stderr/error/exit)
  - readiness polling + launch-failure error assembly with output tail
- Rewired `ServerManager.launchLocalServerRuntime()` to delegate launch mechanics to `LocalSidecarLauncher` while retaining:
  - lifecycle status transitions
  - managed server state persistence and listener pid refresh
  - restart/adopt/conflict orchestration and diagnostics ownership
- Updated lane-targeted tests to assert the new seam (`LocalSidecarLauncher.launchRuntime`) instead of removed `ServerManager` private launch internals.
- Hotspot delta after extraction:
  - `ServerManager.ts`: `1167 -> 809` lines (reduced by 358)
  - import count: `8 -> 9` (new adjacent owner import)
- Updated module docs and barrel docs for the new adjacent owner.
- Updated lane roadmap queue state (`[NEXT]` -> `[DONE]`).

## Files Changed

- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/LocalSidecarLauncher.ts`
- `src/core/opencode/index.ts`
- `tests/unit/core/opencode/ServerManager.runtime.test.ts`
- `tests/unit/core/opencode/ServerManager.lifecycle.test.ts`
- `tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`
- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/opencode/LocalSidecarLauncher.md`
- `docs/modules/core/opencode/index.md`
- `docs/status/lanes/t2-servermanager-launch/autopilot-round-roadmap.md`
- `docs/status/lanes/t2-servermanager-launch/autopilot-phase-1.md`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`

## Validation

- Targeted lane tests first (roadmap-configured):
  - `npm test -- --runInBand tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.lifecycle.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`
- Module-doc gate:
  - `npm run check:module-docs`
- Graph refresh after `src/` changes:
  - `npm run graphify:update:src`
- Final configured round gate:
  - `npm run verify`
- Controller-configured blank commands recorded:
  - lint: blank in round metadata
  - typecheck: blank in round metadata
  - build: blank in round metadata
  - full-test gate: `npm run verify`

## Code Review Result

- **Verdict**: PASS
- **Acceptance check**:
  - `ServerManager.ts` surface shrank from **1167 -> 809 lines** (measurable reduction).
  - Launch seam extraction is cohesive and durable (`LocalSidecarLauncher` owns multiple related launch behaviors, not wrapper-only forwarding).
  - `ServerManager` still owns lifecycle state machine, managed-state truth, adopt/restart/conflict decisions, and diagnostics wiring.
  - Out-of-scope hotspots (`main.ts`, `OpenCodianView.ts`, `OpenCodeService.ts`) were untouched.
  - Validation gates are green, including full `npm run verify`.

## Outcome

- Round objective completed successfully for lane `t2-servermanager-launch` Task 1.
- Lane queue now has no remaining `[NEXT]`/`[QUEUED]` items and is ready to hand off to `t3-checkpoint`.

## Next Recommended Slice

- Switch controller to lane `t3-checkpoint`, execute its first `[NEXT]` checkpoint task, and stop after queue checkpoint closeout.
