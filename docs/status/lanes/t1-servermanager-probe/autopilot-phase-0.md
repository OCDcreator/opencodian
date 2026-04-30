# Autopilot Phase 0 — `t1-servermanager-probe`

## Lane Goal

Shrink `src/core/opencode/ServerManager.ts` by moving cross-platform process and port probing into one durable adjacent owner, while keeping lifecycle orchestration, managed-server state truth, and sidecar decision policy inside `ServerManager`.

## Baseline

- Current hotspot: `src/core/opencode/ServerManager.ts`
- Current size: `1298` lines and `9` top-level imports
- Existing adjacent owners already in place:
  - `src/core/opencode/LocalSidecarEndpointResolver.ts` for occupied-endpoint policy and diagnostics
  - `src/core/opencode/LocalSidecarProcessInspector.ts` for OS-specific process inspection primitives
- Remaining in-manager probe ownership still includes:
  - port availability checks
  - wait-for-port-release polling
  - managed pid termination helpers
  - Windows process-tree termination
  - plugin-managed listener detection helpers

## Acceptance Shape

- `ServerManager.ts` loses a real probe-oriented responsibility cluster.
- The extracted owner is cohesive and multi-call, not a forwarding helper.
- `ServerManager.ts` stays the lifecycle/state owner.
- `OpenCodianView.ts`, `OpenCodeService.ts`, and `main.ts` remain untouched.

## Validation Expectation

- Targeted `ServerManager` tests first.
- `npm run check:module-docs` and `npm run graphify:update:src` when needed.
- `npm run verify` before the round can succeed.
