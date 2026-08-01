# Autopilot Baseline: Phase 0 — `m3-checkpoint`

> **Status**: [BASELINE]
> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Live plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`

## Objective

- Implement OpenCode session/message/part alignment while preserving OpenCodian's existing UI shell.

## Lane Scope

- Reload/finalization compensation, diagnostics, regressions, and final gates for Task 7.

## Required Reading

- `AGENTS.md`
- `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`
- `docs/archive/maintainability/autopilot/autopilot-master-plan.md`
- `docs/archive/maintainability/autopilot/autopilot-lane-map.md`
- `docs/status/lanes/m3-checkpoint/autopilot-round-roadmap.md`

## Validation Baseline

- Follow the task-specific targeted test command in the lane roadmap.
- Run `npm run verify` and `npm run check:module-docs` only at the final checkpoint or before merge, unless a task explicitly requires broader validation.

## Notes

- This document captures the starting baseline for lane `m3-checkpoint`.
- The first unattended round in this lane should write `docs/status/lanes/m3-checkpoint/autopilot-phase-1.md`.
