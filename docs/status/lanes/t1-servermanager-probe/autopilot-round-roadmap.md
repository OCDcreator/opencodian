# Autopilot Round Roadmap — `t1-servermanager-probe`

## Queue

### [NEXT] Task 1 - Package `ServerManager` process and port probing into `LocalProcessProbe`

- **Goal**: Move the cross-platform process/port probe cluster out of `ServerManager.ts` into one durable adjacent owner without changing lifecycle semantics.
- **Key files**:
  - `src/core/opencode/ServerManager.ts`
  - `src/core/opencode/LocalSidecarProcessInspector.ts`
  - `src/core/opencode/index.ts`
  - matching tests/docs
- **Acceptance**:
  - `ServerManager.ts` line or import surface decreases measurably.
  - The new owner holds process/port probing, port-release polling, and managed-pid termination primitives as one cohesive boundary.
  - `ServerManager.ts` keeps lifecycle orchestration, persisted managed-state mutation, and endpoint-resolution policy wiring.
  - No deploy-relevant files are touched.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts`

## Lane State

- When Task 1 is complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `t2-servermanager-launch`.
