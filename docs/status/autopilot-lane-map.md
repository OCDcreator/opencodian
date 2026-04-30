# Autopilot Lane Map — Thick Owner Thinning (2h Batch)

> **Preset**: `Maintainability / Refactor`
> **Scheduling**: Sequential lane controller
> **Live queue source**: `automation/autopilot-config.json`
> **Note**: This worktree's live unattended queue is the thick-owner thinning batch below, not the historical hotspot packaging or older maintainability docs.

## Lane Directories

- `t1-servermanager-probe` — process/port probe extraction
  - roadmap: `docs/status/lanes/t1-servermanager-probe/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/t1-servermanager-probe/autopilot-phase-0.md`
  - queued tasks: Task 1
- `t2-servermanager-launch` — local sidecar launch-context extraction
  - roadmap: `docs/status/lanes/t2-servermanager-launch/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/t2-servermanager-launch/autopilot-phase-0.md`
  - queued tasks: Task 1
- `t3-checkpoint` — final verification and next-target note
  - roadmap: `docs/status/lanes/t3-checkpoint/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/t3-checkpoint/autopilot-phase-0.md`
  - queued tasks: Task 1

## Primary Source Modules

- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/LocalSidecarProcessInspector.ts`
- `src/core/opencode/LocalSidecarEndpointResolver.ts`
- `docs/modules/core/opencode/ServerManager.md`

## Boundaries

- `ServerManager.ts` is the only code hotspot in scope for code-bearing lanes.
- `OpenCodianView.ts`, `OpenCodeService.ts`, `main.ts`, and settings owners are out of scope for this batch.
- The queue stops after the checkpoint lane even if additional residual hotspots remain.
