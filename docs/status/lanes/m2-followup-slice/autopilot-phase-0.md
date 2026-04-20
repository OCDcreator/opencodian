# Autopilot Baseline: Phase 0

> **Status**: [BASELINE]
> **Preset**: `Maintainability / Refactor`
> **Lane**: `m2-followup-slice`
> **Repository**: `opencodian`

## Objective

- Reduce ownership concentration and maintainability hotspots one queued slice at a time while keeping configured validation commands green.

## Lane scope

- Continue with the next bounded maintainability slice after M1 while keeping the same validation baseline.

## Seeded entrypoints

- `AGENTS.md`
- `README.md`
- `docs/`
- `src/`
- `tests/`
- `main.js`
- `src/utils/icons/lobehubIconManifest.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`

## Inferred validation commands

- Lint: `npm run lint` (source: `package.json:scripts.lint`)
- Typecheck: `npm run typecheck` (source: `package.json:scripts.typecheck`)
- Full test: `npm test` (source: `package.json:scripts.test`)
- Build: `npm run build` (source: `package.json:scripts.build`)
- Vulture: not inferred

## Notes

- This document captures the baseline for lane `m2-followup-slice`.
- The first unattended round in this lane should write `docs/status/lanes/m2-followup-slice/autopilot-phase-1.md`.
