# Autopilot Phase 1 — `t3-checkpoint`

## Round Design

- **Queued slice (`[NEXT]`)**: Task 1 - verify the `ServerManager` hotspot delta, record the next manual target order, and stop the queue cleanly.
- **Goal restatement**: close the thick-owner thinning batch with evidence-backed checkpoint docs only; do not add new automatic backlog.
- **Targeted hotspot files and adjacent owners**:
  - hotspot evidence target: `src/core/opencode/ServerManager.ts`
  - comparison/manual-order context only: `src/main.ts`, `src/core/opencode/OpenCodeService.ts`, `src/features/chat/OpenCodianView.ts`
  - queue and checkpoint docs: `docs/status/lanes/t3-checkpoint/autopilot-round-roadmap.md`, `docs/status/lanes/t3-checkpoint/autopilot-phase-1.md`
- **Before/after ownership surface intended for this slice**:
  - before: queue already landed two `ServerManager` seam extractions; checkpoint not yet recorded in this lane.
  - after: no source ownership change in this lane; checkpoint captures fresh hotspot evidence, explicit manual next-target order, and clean queue stop.
- **Likely tests/docs to change**:
  - docs: lane roadmap + this phase report.
  - validation: final queue-close gate `npm run verify`.
- **Explicit non-goals**:
  - no `src/` edits and no new seam extraction.
  - no changes to `src/main.ts`, `src/core/opencode/OpenCodeService.ts`, `src/features/chat/OpenCodianView.ts`.
  - no deploy/test-vault actions.
  - no new `[QUEUED]` backlog items.

## Hotspot Baseline

- Fresh hotspot measurements (`wc -l` + `rg '^import '`):
  - `src/core/opencode/ServerManager.ts`: **809 lines**, **9 imports**.
  - `src/main.ts`: **1417 lines**, **17 imports**.
  - `src/core/opencode/OpenCodeService.ts`: **1756 lines**, **25 imports**.
  - `src/features/chat/OpenCodianView.ts`: **5314 lines**, **87 imports**.
- `ServerManager` delta across this batch:
  - baseline before lane `t1`: **1298 lines**, **9 imports**.
  - after lane `t2` and at this checkpoint: **809 lines**, **9 imports**.
  - net: **-489 lines** while keeping lifecycle/state ownership in `ServerManager`.
- Queue/churn evidence:
  - `43ebaf0b autopilot: round 2 - extract servermanager local process probe seam`
  - `1412d9ff autopilot: round 3 - extract local sidecar launcher seam`

## Design Review Result

- **Verdict**: PASS
- **Why PASS**:
  - this lane's `[NEXT]` task is checkpoint-only, and the design stays documentation + validation scoped.
  - acceptance criteria are directly mapped: fresh hotspot evidence, explicit manual next-target order, and no invented automatic backlog.
  - non-goals keep all high-risk owners untouched.

## Implementation Summary

- Recorded fresh `ServerManager` and residual hotspot evidence for closeout.
- Updated lane roadmap queue state from `[NEXT]` to `[DONE]` for the executed checkpoint item.
- Closed the lane queue with no remaining `[NEXT]` or `[QUEUED]` items.
- Captured explicit manual next-target order (not auto-queued):
  1. `src/main.ts`
  2. `src/core/opencode/OpenCodeService.ts`
  3. `src/features/chat/OpenCodianView.ts`

## Files Changed

- `docs/status/lanes/t3-checkpoint/autopilot-phase-1.md`
- `docs/status/lanes/t3-checkpoint/autopilot-round-roadmap.md`

## Validation

- Configured command fields from round metadata:
  - lint command: blank
  - typecheck command: blank
  - build command: blank
- Required final gate:
  - `npm run verify` ✅

## Code Review Result

- **Verdict**: PASS
- **Acceptance check**:
  - roadmap executed exactly one queued slice (`t3` Task 1) and closed with no remaining `[NEXT]`/`[QUEUED]`.
  - checkpoint contains fresh hotspot evidence for `ServerManager`.
  - explicit manual next-target order is documented without creating new automatic backlog.
  - no out-of-scope source-owner edits were introduced.
  - required validation gate passed.

## Outcome

- `t3-checkpoint` Task 1 completed as `[DONE]`.
- Thick-owner thinning 2h batch queue is closed cleanly at checkpoint.

## Next Recommended Slice

- Manual follow-up only (outside this queue): evaluate a conservative next thinning entry in order `src/main.ts` -> `src/core/opencode/OpenCodeService.ts` -> `src/features/chat/OpenCodianView.ts`, with a new explicitly scoped queue before code changes.
