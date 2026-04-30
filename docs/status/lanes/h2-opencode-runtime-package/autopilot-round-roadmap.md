# Autopilot Round Roadmap — `h2-opencode-runtime-package`

## Queue

### [DONE] Task 1 - Package `OpenCodeService` lifecycle/query/control assembly

- **Goal**: Remove one stable lifecycle/query/control assembly slice from `OpenCodeService.ts` by strengthening existing coordinators instead of piling more orchestration into the service facade.
- **Key files**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`
  - `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts`
  - matching tests/docs
- **Acceptance**:
  - `OpenCodeService.ts` line or import surface decreases measurably.
  - No public behavior regresses across CRUD, session control, or catalog query flows.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeService.sdkCrudSync.test.ts tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeCatalogQueryCoordinator.test.ts`

### [DONE] Task 2 - Package stream and sync mutation ownership

- **Goal**: Reduce direct stream/sync mutation pressure in `OpenCodeService.ts` by tightening ownership with the existing streaming and sync runtime coordinators.
- **Key files**:
  - `src/core/opencode/OpenCodeService.ts`
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeStreamEventTransformer.ts`
  - matching tests/docs
- **Acceptance**:
  - Stream and sync mutation assembly shifts toward the existing coordinators.
  - SDK-first plus legacy fallback semantics remain intact.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/OpenCodeStreamingRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeSyncEventRuntimeCoordinator.test.ts tests/unit/core/opencode/OpenCodeStreamEventTransformer.test.ts tests/unit/core/opencode/OpenCodeService.sdkStreamEvents.test.ts`

### [DONE] Task 3 - Package local sidecar adopt/restart diagnostics

- **Goal**: Shrink a concentrated lifecycle/diagnostics slice in `ServerManager.ts` while preserving managed-sidecar adoption, restart, conflict detection, and endpoint ownership semantics.
- **Key files**:
  - `src/core/opencode/ServerManager.ts`
  - `src/core/opencode/LocalSidecarProcessInspector.ts`
  - `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
  - matching tests/docs
- **Acceptance**:
  - `ServerManager.ts` loses a durable responsibility cluster without changing sidecar truth semantics.
  - Adopt/restart/conflict test coverage stays green.
- **Validation**: `npm test -- --runInBand tests/unit/core/opencode/ServerManager.lifecycle.test.ts tests/unit/core/opencode/ServerManager.runtime.test.ts tests/unit/core/opencode/ServerManager.occupiedEndpoint.test.ts tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts`

## Lane State

- When Task 1-3 are complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `h3-settings-bootstrap-package`.
