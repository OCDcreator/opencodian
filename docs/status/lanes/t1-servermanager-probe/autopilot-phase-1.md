# Autopilot Phase 1 — `t1-servermanager-probe`

## Round Design

- **Queued slice**: `[NEXT] Task 1 - Package ServerManager process and port probing into LocalProcessProbe` from `docs/status/lanes/t1-servermanager-probe/autopilot-round-roadmap.md`.
- **Goal interpretation**: keep `ServerManager` as lifecycle/state owner, but move the durable process/port probe boundary (port bind checks, port-release polling, managed-pid termination primitives including Windows tree kill handling) into one adjacent owner.
- **Targeted hotspot and adjacent owners**:
  - hotspot: `src/core/opencode/ServerManager.ts`
  - adjacent owner to expand: `src/core/opencode/LocalSidecarProcessInspector.ts` (introduce `LocalProcessProbe` boundary here)
  - wiring/export/docs: `src/core/opencode/index.ts`, `docs/modules/core/opencode/ServerManager.md`, `docs/modules/core/opencode/LocalSidecarProcessInspector.md`, `docs/modules/core/opencode/index.md`
  - likely tests: `tests/unit/core/opencode/ServerManager.runtime.test.ts`, `tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`, and probe-owner unit tests as needed.
- **Before ownership surface (ServerManager)**:
  - owns endpoint bind probing (`isPortAvailable`, `canBindLocalEndpoint`)
  - owns port-release polling (`waitForPortAvailability`)
  - owns managed-pid termination primitives (`terminateManagedPid*`, `killWindowsProcessTree*`)
- **After ownership surface (intended)**:
  - `ServerManager` keeps lifecycle sequencing, managed-state truth updates, endpoint-resolution policy wiring.
  - `LocalProcessProbe` owns OS/process probe and managed-pid termination primitives used by shutdown/adopt/restart flows.
- **Likely test/doc changes**:
  - adjust private method spies in ServerManager runtime tests to the new probe seam calls.
  - keep or add focused probe owner tests for termination/port polling behavior.
  - update module docs for new ownership seam.
- **Explicit non-goals**:
  - no changes to `src/main.ts`, `src/features/chat/OpenCodianView.ts`, or `src/core/opencode/OpenCodeService.ts`.
  - no launch-context seam extraction (that belongs to lane `t2-servermanager-launch`).
  - no deploy actions and no deploy-relevant file changes.

## Hotspot Baseline

- `src/core/opencode/ServerManager.ts`: **1298 lines**, **9 imports**.
- `src/core/opencode/LocalSidecarProcessInspector.ts`: **195 lines**, **1 import**.
- Probe-oriented methods currently still in `ServerManager.ts` for this slice:
  - `isPortAvailable`, `waitForPortAvailability`
  - `killWindowsProcessTree`, `killWindowsProcessTreeSync`
  - `terminateManagedPid`, `terminateManagedPidSync`
  - `getCurrentPluginManagedListenerPid`, `getCurrentPluginManagedListenerPidSync`

## Design Review Result

- **Verdict**: `PASS`
- **Why PASS**:
  - extraction remains inside the queued seam and keeps `ServerManager` as lifecycle/state owner.
  - it avoids thin-file sprawl by expanding one existing adjacent protocol owner (`LocalSidecarProcessInspector.ts`) with a cohesive `LocalProcessProbe` boundary.
  - acceptance criteria are directly measurable (ServerManager surface/line reduction + moved probe ownership + unchanged lifecycle orchestration).
- **Risk checks**:
  - preserve existing shutdown semantics (including Windows fallback behavior when `taskkill` non-zero but process already gone).
  - preserve sync dispose behavior for local port release checks.
  - preserve resolver-based plugin-sidecar classification logic while moving process/port primitives only.

## Implementation Summary

- Added `LocalProcessProbe` to `src/core/opencode/LocalSidecarProcessInspector.ts` as the cohesive adjacent owner for:
  - local bind probing (`canBindLocalEndpoint`)
  - port-release polling (`waitForPortAvailability`)
  - managed pid termination primitives (`terminateManagedPid*`, Windows `taskkill` tree handling)
  - plugin-managed listener PID lookup wrappers with injected command classifier callback
- Reduced `ServerManager` ownership by delegating process/port probe primitives to `processProbe` and deleting in-file probe/termination helper cluster.
- Preserved `ServerManager` as lifecycle/state owner: start/stop/restart sequencing, managed state persistence, endpoint-resolution policy wiring, launch tracking, and diagnostics remain in place.
- Updated barrel and module docs to expose/document the new seam.
- Updated ServerManager-focused unit tests to assert delegation through `processProbe` seam.

## Files Changed

- `src/core/opencode/LocalSidecarProcessInspector.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/index.ts`
- `tests/unit/core/opencode/ServerManager.runtime.test.ts`
- `tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`
- `tests/unit/core/opencode/ServerManager.lifecycle.test.ts`
- `docs/modules/core/opencode/LocalSidecarProcessInspector.md`
- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/opencode/index.md`
- `docs/status/lanes/t1-servermanager-probe/autopilot-round-roadmap.md`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`

## Validation

- Targeted lane command:
  - `npm test -- --runInBand tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts` ✅
- Additional focused checks after seam refactor:
  - `npm test -- --runInBand tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts tests/unit/core/opencode/ServerManager.lifecycle.test.ts` ✅
- Boundary/doc freshness checks:
  - `npm run check:module-docs` ✅
  - `npm run graphify:update:src` ✅
- Final required gate:
  - `npm run verify` ✅
- Configured validation fields from controller metadata:
  - lint command field: blank (used `npm run verify` gate instead)
  - typecheck command field: blank (used `npm run verify` gate instead)
  - build command field: blank (build still executed inside `npm run verify`)

## Code Review Result

- **Verdict**: `PASS`
- **Acceptance check**:
  - `ServerManager.ts` reduced from **1298 → 1167** lines and **9 → 8** imports.
  - Process/port probing + port-release polling + managed-pid termination primitives now live under `LocalProcessProbe` in one adjacent owner module.
  - `ServerManager` remains lifecycle/state owner; no scope drift into out-of-lane files (`main.ts`, `OpenCodianView.ts`, `OpenCodeService.ts` untouched).
  - Targeted tests and full `npm run verify` are green.
- **Guardrail check**:
  - No thin multi-file adapter sprawl introduced; seam extraction stayed inside one existing adjacent owner file.
  - Module docs and graphify artifacts were refreshed to keep maintainability gates truthful.

## Outcome

- Completed roadmap item: `t1-servermanager-probe` Task 1 (`[DONE] Package ServerManager process and port probing into LocalProcessProbe`).
- Lane queue state now has no `[NEXT]`/`[QUEUED]` items and is ready to hand off to lane `t2-servermanager-launch`.

## Next Recommended Slice

- Move to `t2-servermanager-launch` Task 1: extract local sidecar launch-context ownership (binary resolution, spawn env, launch output-tail/ready orchestration) into one cohesive adjacent owner while preserving `ServerManager` lifecycle/state ownership.
