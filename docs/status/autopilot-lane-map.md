# Autopilot Lane Map

> **Preset**: `Maintainability / Refactor`
> **Scheduling**: Sequential lane controller
> **Note**: The active lane comes from `automation/autopilot-config.json`; this file is a static index.

## Lane directories

- `m1-hotspot-slice`
  - roadmap: `docs/status/lanes/m1-hotspot-slice/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m1-hotspot-slice/autopilot-phase-0.md`
- `m2-followup-slice`
  - roadmap: `docs/status/lanes/m2-followup-slice/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m2-followup-slice/autopilot-phase-0.md`
- `m3-checkpoint`
  - roadmap: `docs/status/lanes/m3-checkpoint/autopilot-round-roadmap.md`
  - baseline: `docs/status/lanes/m3-checkpoint/autopilot-phase-0.md`

## Suggested entrypoints

- `AGENTS.md`
- `README.md`
- `docs/`
- `src/`
- `tests/`
- `main.js`
- `src/utils/icons/lobehubIconManifest.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`

## Validation baseline

- Lint: `npm run lint` (source: `package.json:scripts.lint`)
- Typecheck: `npm run typecheck` (source: `package.json:scripts.typecheck`)
- Full test: `npm test` (source: `package.json:scripts.test`)
- Build: `npm run build` (source: `package.json:scripts.build`)
- Vulture: not inferred

## Boundaries

- Do not refactor outside the queued slice
- Do not turn maintainability work into a broad rewrite
- Keep `automation/runtime/` ignored and machine-local state out of committed files
