# Autopilot Phase 0 — `t2-servermanager-launch`

## Lane Goal

Shrink `src/core/opencode/ServerManager.ts` again by moving local sidecar launch-context ownership into one durable adjacent owner after the probe seam is no longer mixed into the same file.

## Baseline

- This lane should begin only after `t1-servermanager-probe` lands.
- The target remains `src/core/opencode/ServerManager.ts`.
- Expected residual launch-context ownership includes:
  - binary resolution
  - spawn environment construction
  - local sidecar spawn
  - startup output tail tracking
  - ready/health wait logic
  - launch-failure error assembly

## Acceptance Shape

- `ServerManager.ts` loses one more cohesive seam while staying the lifecycle/state owner.
- The extracted owner is a strong launch-context owner, not a one-method shell.
- Process/port probe logic from `t1` must not be reintroduced here.
- No deploy-relevant files are touched.

## Validation Expectation

- Targeted `ServerManager` tests first, including launch/runtime coverage.
- `npm run check:module-docs` and `npm run graphify:update:src` when needed.
- `npm run verify` before the round can succeed.
