# Autopilot Round Roadmap — `t2-servermanager-launch`

## Queue

### [NEXT] Task 1 - Package `ServerManager` local sidecar launch context into `LocalSidecarLauncher`

- **Goal**: Move spawn, launch tracking, launch failure assembly, and health-ready waiting out of `ServerManager.ts` into one durable adjacent owner.
- **Key files**:
  - `src/core/opencode/ServerManager.ts`
  - `src/core/opencode/index.ts`
  - one new adjacent owner under `src/core/opencode/`
  - matching tests/docs
- **Acceptance**:
  - `ServerManager.ts` line or import surface decreases measurably again.
  - The extracted launch-context owner owns multiple related launch behaviors, not just a wrapper method.
  - `ServerManager.ts` keeps lifecycle state transitions, managed-state truth, restart/adopt decisions, and diagnostics wiring.
  - No deploy-relevant files are touched.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.lifecycle.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`

## Lane State

- When Task 1 is complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `t3-checkpoint`.
