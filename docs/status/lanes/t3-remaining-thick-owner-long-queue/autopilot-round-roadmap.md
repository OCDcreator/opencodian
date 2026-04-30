# Remaining Thick Owner Long Queue Roadmap

### [NEXT] Task 1 - Package `main.ts` startup bootstrap into `OpenCodianStartupCoordinator`

- Primary owner: `src/main.ts` as a high-connection lifecycle shell
- Intended adjacent owner: `src/core/runtime/OpenCodianStartupCoordinator.ts`
- Scope: startup preparation/bootstrap sequencing only
- Hard non-goals:
  - no `OpenCodianView.ts`
  - no `OpenCodeService.ts`
  - no feature work

### [QUEUED] Task 2 - Verify and document the `main.ts` startup move

- Update `docs/modules/entry-point/main.md`
- Add `docs/modules/core/runtime/OpenCodianStartupCoordinator.md`
- Refresh graphify and keep verification evidence aligned

### [QUEUED] Task 3 - Package `main.ts` settings runtime into `OpenCodianSettingsRuntimeCoordinator`

- Primary owner: `src/main.ts` as a high-connection lifecycle shell
- Intended adjacent owner: `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`
- Scope: save/update/persist/refresh/config-sync choreography only

### [QUEUED] Task 4 - Verify and document the `main.ts` settings runtime move

- Update `docs/modules/entry-point/main.md`
- Add `docs/modules/core/runtime/OpenCodianSettingsRuntimeCoordinator.md`
- Refresh graphify and keep verification evidence aligned

### [QUEUED] Task 5 - Move `OpenCodeService.ts` project-compaction reload into `OpenCodeServiceLifecycleCoordinator`

- Primary owner: `src/core/opencode/OpenCodeService.ts` as a facade/compatibility shell
- Intended adjacent owner: existing `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- Scope: compaction reload + resolved-config validation only

### [QUEUED] Task 6 - Verify and document the lifecycle move

- Update `docs/modules/core/opencode/OpenCodeService.md`
- Update `docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md`
- Refresh graphify and keep verification evidence aligned

### [QUEUED] Task 7 - Record checkpoint and next remaining thick-owner order

- Update `docs/status/lanes/t3-remaining-thick-owner-long-queue/autopilot-status.md`
- State whether `OpenCodianView.ts` is ready for the next unattended batch
