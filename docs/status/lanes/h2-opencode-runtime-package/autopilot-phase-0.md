# Autopilot Phase 0 — `h2-opencode-runtime-package`

## Mission

Package the OpenCode runtime hotspot by shrinking direct ownership in `OpenCodeService.ts` and `ServerManager.ts` while preserving SDK-first plus legacy fallback behavior, session-scoped streaming semantics, and local sidecar lifecycle correctness.

## Baseline Hotspot Evidence

- `src/core/opencode/OpenCodeService.ts`
  - about `1867` lines
  - `25` imports
  - `103` touches in the last 120 days
- `src/core/opencode/ServerManager.ts`
  - about `1418` lines
  - `29` touches in the last 120 days
- Adjacent owners:
  - `src/core/opencode/OpenCodeStreamingRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeSyncEventRuntimeCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts`
  - `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`

## Success Signals

- `OpenCodeService.ts` stops directly assembling one more durable runtime slice.
- `ServerManager.ts` retains sidecar semantics but loses at least one concentrated bundle of direct responsibility.
- SDK/legacy fallback, session abort/detach, and sidecar adopt/restart tests remain green.

## Guardrails

- Do not remove the legacy fallback path casually.
- Do not change `4196` managed-server semantics or signature checks without targeted tests.
- Do not scatter transport logic across new thin files.

## Queue Entry

Start from `docs/status/lanes/h2-opencode-runtime-package/autopilot-round-roadmap.md` and execute the first `[NEXT]` item only.
