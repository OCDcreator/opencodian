# Autopilot Master Plan — Thick Owner Thinning (2h Batch)

> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/autopilot-config.json`
> **Runtime shape**: Codex-only unattended rounds with mandatory Codex design review and code review

## Overall Objective

Complete one conservative thick-owner thinning batch that can plausibly close within two hours:

- reduce `ServerManager.ts` ownership through two durable, adjacent seams
- keep behavior unchanged for local sidecar lifecycle, adoption, restart, conflict, and health semantics
- preserve the maintenance-phase anti-fragmentation rules
- stop after a checkpoint instead of inventing more backlog

This queue intentionally does **not** try to thin every residual hotspot at once. The current goal is a high-confidence batch that lands real maintainability movement without touching deploy-relevant runtime files or drifting into `OpenCodianView.ts` / `OpenCodeService.ts`.

## Why This Queue First

Current residual hotspot evidence from the latest checkpoint:

- `src/core/opencode/ServerManager.ts` remains at `1298` lines and `9` imports
- `src/main.ts` remains at `1417` lines and `17` imports
- `src/core/opencode/OpenCodeService.ts` and `src/features/chat/OpenCodianView.ts` remain higher-risk shells and are explicitly out of scope for this short batch

`ServerManager.ts` is the best first target because:

- it is still thick enough to warrant another controlled slice
- it has clear adjacent seams for process/port probing and local launch-context ownership
- it can be improved without touching deploy-relevant plugin entry or settings surfaces
- earlier unattended exploration already proved these seams are real rather than line-count theater

## Lane Order

1. `t1-servermanager-probe` — move cross-platform process/port probing into a durable adjacent owner
2. `t2-servermanager-launch` — move local sidecar launch-context ownership into a durable adjacent owner
3. `t3-checkpoint` — re-measure the hotspot, verify the delta, record next-manual-target order, and stop

## Required Reading At Every Round

- `AGENTS.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `docs/status/autopilot-master-plan.md`
- `docs/status/autopilot-lane-map.md`
- the active `docs/status/lanes/<lane-id>/autopilot-round-roadmap.md`
- the active lane's latest `autopilot-phase-*.md`
- the matching module docs before source edits

## Validation Baseline

- Focused Jest coverage is required first for code-bearing rounds.
- `npm run check:module-docs` is required whenever module boundaries change.
- `npm run graphify:update:src` is required whenever `src/` changes so `npm run verify` stays truthful.
- `npm run verify` is the final gate for every successful round.
- Deploy is intentionally out of scope for this batch; no lane should touch deploy-relevant files.

## Guardrails

- Do not modify `reference-projects/`.
- Do not touch `src/main.ts`, `src/features/chat/OpenCodianView.ts`, `src/core/opencode/OpenCodeService.ts`, or deploy-relevant settings files in this batch.
- Do not introduce thin helper / adapter / provider / factory files.
- Prefer one cohesive adjacent owner over multiple tiny seams.
- Keep `ServerManager.ts` as the lifecycle/state owner; only durable sub-ownership moves out.
- If a queued slice proves larger than expected, land the smaller durable seam and stop rather than widening scope.

## Completion Rule

When `t1`, `t2`, and `t3` have no remaining `[NEXT]` or `[QUEUED]` items, this queue is complete. The controller must stop and leave the next target as a manual follow-up decision instead of auto-extending into `main.ts` or another hotspot.
