# Model Config Maintainability Master Plan

> **Status**: [ACTIVE]
> **Purpose**: Controlled unattended maintainability queue for coarse package extraction and defragmentation after the Agents / Commands / Session Settings feature line completed.
> **Base**: Branch `autopilot/model-config-maintainability`, starting from feature-complete commit `d14186f`.

## Objective

Improve maintainability without creating more thin helper sprawl:

1. Coarsely extract `ModelConfigModal` into a small number of cohesive modules.
2. Defragment the overly granular `TrailingAssistantPatch*` helper family into semantic bundles.
3. Medium-split `ProviderIconService` by durable responsibility boundaries.
4. Coarsely extract reusable style controls / preset UI from `SettingsStyleSection`.
5. Preserve `lint 0/0`, typecheck, full tests, and production build.

## Current Baseline

- `src/features/chat/OpenCodianView.ts` remains large, but chat already has many tiny adjacent files; do not start by extracting more chat helpers.
- `src/features/chat/services/` has high file-count pressure; defragment before any new chat owner extraction.
- `src/features/settings/ModelConfigModal.ts` and `src/utils/icons/ProviderIconService.ts` are thick, cohesive, and better first targets.
- `src/core/types/settings.ts`, `src/core/opencode/OpenCodeService.ts`, `src/core/opencode/ServerManager.ts`, and `src/main.ts` are explicitly out of scope for this queue unless a validation blocker demands a minimal touch.

## Guardrails

- Do not create thin helper / adapter / provider / factory files.
- Prefer 2-4 cohesive modules per package-level extraction; never split one function family into many sub-100-line files.
- New files should generally be at least ~120 lines or own a complete responsibility, unless they are type barrels or unavoidable test fixtures.
- Do not move code merely to reduce a line count; each module boundary must have a stable semantic name and clear ownership.
- Do not regress public behavior, model config persistence semantics, provider icon fallback order, slash command behavior, or chat streaming/session behavior.
- Do not deploy to Test Vault in this queue.
- Every successful code round must run targeted tests first, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Out Of Scope

- Large `OpenCodianView` refactors.
- `settings.ts` decomposition.
- New feature work.
- Global OpenCode config writes.
- Test Vault deployment.

## Reading Order

1. `AGENTS.md`
2. `docs/status/model-config-maintainability-master-plan.md`
3. `docs/status/model-config-maintainability-round-roadmap.md`
4. `docs/status/model-config-maintainability-lane-map.md`
5. Latest `docs/status/model-config-maintainability-phase-*.md`, when present
