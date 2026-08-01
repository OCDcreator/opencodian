# Autopilot Baseline: Phase 0 — `m1-hotspot-slice`

> **Status**: [BASELINE]
> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Live plan source**: `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`

## Objective

- Implement OpenCode session/message/part alignment while preserving OpenCodian's existing UI shell.

## Lane Scope

- Session graph, structured send payloads, and sync-event mutation foundations for Tasks 1-3.

## Required Reading

- `AGENTS.md`
- `docs/superpowers/plans/2026-04-21-opencode-session-message-alignment.md`
- `docs/archive/maintainability/autopilot/autopilot-master-plan.md`
- `docs/archive/maintainability/autopilot/autopilot-lane-map.md`
- `docs/status/lanes/m1-hotspot-slice/autopilot-round-roadmap.md`

## Validation Baseline

- Follow the task-specific targeted test command in the lane roadmap.
- Run `npm run verify` and `npm run check:module-docs` only at the final checkpoint or before merge, unless a task explicitly requires broader validation.

## Notes

- This document captures the starting baseline for lane `m1-hotspot-slice`.
- The first unattended round in this lane should write `docs/status/lanes/m1-hotspot-slice/autopilot-phase-1.md`.
