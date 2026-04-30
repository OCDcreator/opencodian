# Autopilot Master Plan — Hotspot Core Packaging

> **Preset**: `Maintainability / Refactor`
> **Repository**: `opencodian`
> **Controller mode**: Explicit sequential lanes from `automation/autopilot-config.json`
> **Live queue source**: `docs/status/autopilot-lane-map.md` plus lane-local roadmaps under `docs/status/lanes/`
> **Important**: `docs/status/maintainability-*.md` is the finished historical maintainability run. This branch reopens work with a new hotspot queue and must not inherit `[NEXT]` items from the paused queue.

## Overall Objective

Package the current hotspot core files into stronger single-responsibility owners one queued slice at a time:

- Reduce direct ownership, assembly pressure, and import surface in the hottest files without creating thin-wrapper sprawl.
- Preserve OpenCodian's existing runtime behavior, especially concurrent chat tabs, SDK-first plus legacy fallback, settings persistence, and local sidecar lifecycle.
- Keep `docs/modules/**`, graphify artifacts, and verification gates aligned after each landed slice.
- Stop only on a clean checkpoint with fresh hotspot evidence, not on a vague “looks better” judgment.

## Current Hotspot Inventory

- `src/features/chat/OpenCodianView.ts`
  - about `5418` lines, `91` imports, `306` touches in the last 120 days
  - dominant chat runtime owner and the highest combined size/churn hotspot
- `src/core/opencode/OpenCodeService.ts`
  - about `1867` lines, `25` imports, `103` touches in the last 120 days
  - central OpenCode runtime facade with session, stream, sync, and transport pressure
- `src/features/settings/OpenCodianSettings.ts`
  - `96` touches in the last 120 days and very high churn despite adjacent section owners already existing
  - still acts as the settings shell and cross-section bridge hotspot
- `src/main.ts`
  - about `1546` lines, `16` imports, `67` touches in the last 120 days
  - startup, runtime warmup, and cross-view refresh orchestration hotspot
- `src/core/opencode/ServerManager.ts`
  - about `1418` lines, `9` imports, `29` touches in the last 120 days
  - local sidecar lifecycle, adopt/restart, and diagnostics hotspot
- `src/features/settings/SettingsModelCatalogPresenter.ts`
  - about `1362` lines, `7` imports
  - dense presentation-state shell that is adjacent to the settings hotspot and may need packaging or consolidation

## Packaging Strategy

1. Start with the highest-risk hot owner, `OpenCodianView`, and package one stable assembly slice at a time into existing chat runtime owners.
2. Move next to `OpenCodeService` and `ServerManager`, where service/runtime boundaries already exist but still need tighter ownership.
3. Then package the settings and bootstrap shell hotspots so the repo does not simply shift pressure from chat/service into setup/config shells.
4. Finish with a checkpoint lane that recomputes hotspot metrics, trims any thin seams introduced during the run, and confirms the queue can safely stop.

## Lane Order

1. `h1-chat-runtime-package` — package the `OpenCodianView` hotspot.
2. `h2-opencode-runtime-package` — package `OpenCodeService` and `ServerManager`.
3. `h3-settings-bootstrap-package` — package `OpenCodianSettings`, `main.ts`, and nearby settings shells.
4. `h4-checkpoint` — recompute hotspot metrics and close the queue only if the checkpoint is clean.

## Required Reading At Every Round

- `AGENTS.md`
- `graphify-out/GRAPH_REPORT.md`
- `docs/status/autopilot-master-plan.md`
- `docs/status/autopilot-lane-map.md`
- the active `docs/status/lanes/<lane-id>/autopilot-round-roadmap.md`
- the active lane's latest `autopilot-phase-*.md`
- the matching `docs/modules/**` pages for the files named by the active slice

## Validation Baseline

- Targeted tests named in each queued task are required when that task changes code/tests.
- Every successful round must fresh-run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- `npm run check:module-docs` is required when source module boundaries are added, changed, renamed, or deleted.
- `npm run graphify:update:src` plus the repo's graphify freshness gate are required when `src/` changes make the committed graph stale.
- Build/Test Vault deployment is not required for this automation setup change; follow `AGENTS.md` only if a future slice touches deploy-relevant runtime files.

## Guardrails

- Do not modify `reference-projects/`.
- Do not reopen the old paused maintainability queue by inventing `R163+`. This branch has its own explicit hotspot queue.
- Prefer strengthening existing adjacent owners over creating new thin helper, adapter, provider, or factory files.
- Do not push new runtime ownership back into `src/features/chat/OpenCodianView.ts` or `src/core/opencode/OpenCodeService.ts`.
- For settings work, favor section owners and plugin-adjacent startup owners over growing `OpenCodianSettings.ts` or `main.ts`.
- Every successful round must include a Codex design review verdict and a Codex code review verdict.
- Commit every successful round with the configured `autopilot:` prefix.
