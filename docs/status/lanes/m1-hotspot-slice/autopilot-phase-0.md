# Autopilot Baseline: Phase 0

> **Status**: [BASELINE]
> **Preset**: `Maintainability / Refactor`
> **Lane**: `m1-hotspot-slice`
> **Repository**: `opencodian`

## Objective

- Reduce ownership concentration and maintainability hotspots one queued slice at a time while keeping configured validation commands green.

## Lane scope

- Choose one high-value, low-risk maintainability slice and measurably reduce direct ownership, assembly surface, or validation churn.

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

- This document captures the baseline for lane `m1-hotspot-slice`.
- The first unattended round in this lane should write `docs/status/lanes/m1-hotspot-slice/autopilot-phase-1.md`.
