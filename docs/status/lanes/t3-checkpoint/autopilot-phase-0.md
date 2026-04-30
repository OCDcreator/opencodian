# Autopilot Phase 0 — `t3-checkpoint`

## Lane Goal

Close the two-hour thick-owner batch cleanly: record before/after hotspot evidence for `ServerManager.ts`, verify the queue ended without deploy drift or scope expansion, and leave the next manual target order explicit.

## Baseline

- This lane should begin only after `t1` and `t2` complete.
- Residual hotspots outside this batch are expected to remain, especially `main.ts`, `OpenCodeService.ts`, and `OpenCodianView.ts`.
- This lane is documentation and validation focused; it should not invent a new code-bearing backlog item.

## Acceptance Shape

- The queue stops with explicit residual hotspot evidence and next-manual-target guidance.
- No stale `[NEXT]` or `[QUEUED]` items remain after closeout.
- No new code changes are introduced unless strictly required for checkpoint cleanup.

## Validation Expectation

- `npm run verify`
- any doc/graph/module-doc sync needed by prior lanes must already be green
