# Remaining Thick Owner Long Queue Roadmap

### ✅ Task 1 - Package `main.ts` startup bootstrap into `OpenCodianStartupCoordinator`

- Primary owner: `src/main.ts` as a high-connection lifecycle shell
- Intended adjacent owner: `src/core/runtime/OpenCodianStartupCoordinator.ts`
- Scope: startup preparation/bootstrap sequencing only
- Status: **COMPLETED** — extracted 18 methods, added tests, updated docs, verified

### ✅ Task 2 - Verify and document the `main.ts` startup move

- Update `docs/modules/entry-point/main.md`
- Add `docs/modules/core/runtime/OpenCodianStartupCoordinator.md`
- Refresh graphify and keep verification evidence aligned
- Status: **COMPLETED**

### ✅ Task 3 - Package `main.ts` settings runtime into `OpenCodianSettingsRuntimeCoordinator`

- Primary owner: `src/main.ts` as a high-connection lifecycle shell
- Intended adjacent owner: `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`
- Scope: save/update/persist/refresh/config-sync choreography only
- Status: **COMPLETED** — extracted settings save/theme/background logic, verified

### ✅ Task 4 - Verify and document the `main.ts` settings runtime move

- Update `docs/modules/entry-point/main.md`
- Add `docs/modules/core/runtime/OpenCodianSettingsRuntimeCoordinator.md`
- Refresh graphify and keep verification evidence aligned
- Status: **COMPLETED**

### ✅ Task 5 - Move `OpenCodeService.ts` project-compaction reload into `OpenCodeServiceLifecycleCoordinator`

- Primary owner: `src/core/opencode/OpenCodeService.ts` as a facade/compatibility shell
- Intended adjacent owner: existing `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts`
- Scope: compaction reload + resolved-config validation only
- Status: **COMPLETED** — moved 5 methods into existing coordinator, added coordinator-level tests, verified

### ✅ Task 6 - Verify and document the lifecycle move

- Update `docs/modules/core/opencode/OpenCodeService.md`
- Update `docs/modules/core/opencode/OpenCodeServiceLifecycleCoordinator.md`
- Refresh graphify and keep verification evidence aligned
- Status: **COMPLETED**

### ✅ Task 7 - Record checkpoint and next remaining thick-owner order

- Update `docs/status/lanes/t3-remaining-thick-owner-long-queue/autopilot-status.md`
- State whether `OpenCodianView.ts` is ready for the next unattended batch
- Status: **COMPLETED**

## Checkpoint Summary

All planned tasks in this lane are complete. The queue stops at a justified checkpoint:

- `OpenCodianView.ts` (5314 lines, 80+ methods) does **not** have a safe unattended slice.
- AGENTS.md forbids adding new runtime ownership to `OpenCodianView.ts`.
- The next lane must be explicitly designed before unattended execution resumes.
