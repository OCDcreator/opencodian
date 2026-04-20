# Autopilot Master Plan

> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/autopilot-config.json`
> **Note**: This file is a human-facing cross-lane overview, not the live `[NEXT]` truth source.

## Overall objective

- Reduce ownership concentration and maintainability hotspots one queued slice at a time while keeping configured validation commands green.
- Prefer queue-driven ownership reduction over free-form cleanup
- Keep configured validation commands green after every successful round

## Lane order

- `m1-hotspot-slice` — first high-value maintainability / refactor slice
- `m2-followup-slice` — next bounded follow-up slice after M1
- `m3-checkpoint` — document what moved and whether unattended continuation still makes sense

## Shared entrypoints

- `AGENTS.md`
- `README.md`
- `docs/`
- `src/`
- `tests/`
- `main.js`
- `src/utils/icons/lobehubIconManifest.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`

## Shared validation baseline

- Lint: `npm run lint` (source: `package.json:scripts.lint`)
- Typecheck: `npm run typecheck` (source: `package.json:scripts.typecheck`)
- Full test: `npm test` (source: `package.json:scripts.test`)
- Build: `npm run build` (source: `package.json:scripts.build`)
- Vulture: not inferred

## Guardrails

- Only one lane is active at a time
- The controller advances to the next lane only after the current lane roadmap has no remaining `[NEXT]` or `[QUEUED]` items
- Do not extend the queue automatically beyond the preset checkpoint
- Do not change product behavior while chasing maintainability wins
