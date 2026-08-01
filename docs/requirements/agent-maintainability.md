# Agent-Oriented Maintainability Requirements

> Updated: 2026-08-01 (Phase 6 / Task 20 steady-state publication)
>
> This document defines the maintainability requirements that help coding agents understand OpenCodian quickly and modify it safely. It complements `docs/status/development-maintainability-rules.md`: that file is the active guardrail checklist; this file explains the durable product and engineering requirement.

## Current Conclusion (steady state, Phase 6)

The agent-friendly architecture refactor (Phases 0–6, plan `docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md`) reached its steady state. The pre-Phase-6 unattended-maintainability-autopilot program is paused at the `R162` checkpoint and its historical phase/autopilot/checkpoint evidence is archived under `docs/archive/maintainability/` (Task 19) — **not** in the default agent reading chain. There is now exactly **one active architecture roadmap** (the Phase 0–6 plan + this requirements doc + the active rule checklist).

The durable source stack for an agent entering the codebase is:

1. `AGENTS.md` for first-stop rules, commands, and high-risk areas.
2. `architecture-owners.config.json` + `npm run inspect:owner -- <path>` for the canonical owner graph (one owner per managed source path, Phase 0–1).
3. `graphify-out/GRAPH_REPORT.md` for graph-level structure, god nodes, and communities.
4. `docs/modules/**` for file-level ownership and behavior.
5. `docs/status/development-maintainability-rules.md` for active maintainability gates.

The requirement is not to create another large parallel map. The requirement is to keep these sources fresh, connected, and enforced by checks so agents do not rely on stale mental models. The retired owner-guard compatibility layer (`OWNER_GUARD_APPROVED` env / `--approved` free-text waiver / hard-coded path guard) is gone (Phase 2 Task 9); ownership is now enforced by `npm run check:owner-boundaries` against the canonical owner manifest, and budget waivers require a structured diff-bound approval validated by protected CI (`docs/architecture/approvals/README.md`).

## Evidence From The Current Graph

The `src` graph (refreshed `2026-08-01`, content-addressed digest via Phase 2 Task 7) covers 555 files / ~13,393 nodes / ~38,893 edges / ~325 communities. Its highest-connected nodes remain the main cognitive load centers:

- `OpenCodianView` / `OpenCodianPlugin` / `OpenCodeService` / `ServerManager`
- `OpenCodeStreamingRuntimeCoordinator` / `OpenCodeCatalogQueryCoordinator` / `OpencodeConfigManager`
- `ConversationTabRuntimeCoordinator` / `SettingsModelCatalogCoordinator`

These nodes should guide maintainability work. A thick file is not automatically bad, and a small file is not automatically good; the priority is reducing unclear ownership, duplicate state, and unsafe edit surfaces around high-connection owners. The Phase 0–4 refactor moved runtime ownership out of these hubs into consumer-owned ports and coordinators; Phase 5 inventoried the remaining convergence debt (Claude adapter, OpenCodeService, settings plugin-type coupling) and recorded every deferred card with an owner and a hard expiry rather than authorizing an unbounded implementation slice.

## Requirements

### R1. Agent Entry Sources Stay Layered

Agents must be able to build context in this order:

1. Read `AGENTS.md` for rules, commands, and high-risk areas.
2. Resolve the owner of any target path with `npm run inspect:owner -- <path> --json` against the canonical `architecture-owners.config.json` (one owner per managed source path; Phase 0–1).
3. Read `graphify-out/GRAPH_REPORT.md` before architecture or codebase questions.
4. Use `docs/modules/README.md` and mapped module docs for file-level behavior.
5. Use focused source inspection only after the routing sources point to the relevant owner.

Do not replace this layered flow with a large narrative architecture map unless the graph and module docs cannot answer a recurring question. Historical maintainability phase/autopilot evidence lives in `docs/archive/maintainability/` and is **not** part of this default chain (browse it only for specific past-audit context).

### R2. Graphify Freshness Is A Gate, Not A Reminder

When `src/` changes, the committed graph must be refreshed with:

```bash
npm run graphify:update:src
```

The graph is intentionally `src` scoped. Do not use whole-repo `graphify update .` for the committed artifacts.

`npm run check:graphify` must fail when committed `src` history or local `src` edits are newer than `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`. This check belongs in `npm run verify` so routine validation catches stale graph state.

### R3. Module Docs Remain The File-Level Contract

Every added, renamed, changed, or deleted source module must keep its mapped `docs/modules/**` page accurate. Module docs should answer:

- What the module owns.
- What it depends on.
- Which adjacent owner should be changed instead of this module.
- Which behavior or fallback must not be removed casually.

`npm run check:module-docs` remains the hard coverage and diff-accountability gate.

### R4. Thick Owners Become Stable Shells

High-connection files should lose runtime ownership over time, but only through meaningful ownership moves. The target shape is:

- `OpenCodianView.ts`: Obsidian view lifecycle, UI composition, and host wiring; no new long-lived runtime truth.
- `OpenCodeService.ts`: OpenCode facade and compatibility boundary; no ad-hoc session/message/part truth outside `OpenCodeSessionStateStore`.
- `main.ts`: plugin startup composition; no new feature-specific business logic.
- `ServerManager.ts`: local server lifecycle and adoption/restart decisions; no settings UI or chat rendering concerns.
- Settings presenters/sections: one complete settings lifecycle per owner; avoid regrowing broad settings classes.

Do not split files only to reduce line count. A new module must either own a full behavior slice, be reused in at least three places, or isolate a high-risk dependency.

### R5. Avoid Parallel Truth Paths

Maintainability work must reduce duplicate state. In particular:

- Canonical session/message/part state belongs to `OpenCodeSessionStateStore`.
- Render/reload/finalization paths should prefer canonical session state and use server reads as gap recovery.
- `Conversation.messages` should stay compatibility/cache output, not a competing runtime truth source.
- Provider/model availability must keep the existing distinction between local config, server catalog, `baseEffective`, filtered `effective`, provider toggles, and disabled model refs.

### R6. Verification Is Domain-Specific And Then Global

Small docs-only changes may use focused checks, but source behavior changes must end with `npm run verify` unless a blocker is explicitly documented. When behavior touches runtime-facing plugin files, follow the build and Test Vault deployment rules in `AGENTS.md`.

Focused checks should be chosen by domain:

- module ownership changes: `npm run check:module-docs`
- graph or architecture context changes: `npm run check:graphify`
- owner/dependency/cycle changes: `npm run verify:architecture` (manifest / boundaries / dependency-direction / cycles / approvals)
- devlog changes: `npm run check:devlog-order`
- TypeScript behavior changes: relevant focused Jest tests, then lint/typecheck/full tests
- runtime UI/settings/plugin behavior changes: build, Test Vault copy, and deployed `BUILD_ID` verification when required

### R7. The Owner Graph Is The Architectural Contract

The canonical owner graph lives in `architecture-owners.config.json`. Every managed `src/` path resolves to exactly one owner; `npm run inspect:owner -- <path> --json` returns the owner id, layer, entrypoints, responsibilities, canonical state, mapped tests, docs, and required gates. The architecture gates enforce it:

- `npm run check:owner-manifest` — manifest schema + every managed path has exactly one owner (Phase 0).
- `npm run check:owner-boundaries` — owner `allowedOwnerDependencies`/`forbiddenDependencies`/layer rules; replaces the retired hard-coded path guard (Phase 1 Task 4).
- `npm run check:dependency-direction` — no reverse runtime/type edges outside a recorded exception (Phase 1 Task 5).
- `npm run check:architecture-cycles` — no new runtime SCCs; type-only/mixed SCCs are debt, not runtime cycles (Phase 1 Task 5). Exceptions (`dependencyException`) carry evidence + a retirement phase and are regenerated via the dedicated `update:architecture-baseline` command.
- `npm run check:architecture-approvals` — budget waivers require a structured diff-bound approval validated by protected CI, never a self-written JSON or `--approved` free-text waiver (Phase 1 Task 6 / Phase 2 Task 9).

Before modifying a function/class/method, run CodeGraph `callers` and finite-depth `impact` and report direct function/method callers + blast-radius size; do not invent a risk level CodeGraph did not emit. After changes, `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph affected --stdin --path . --json`.

### R8. Deferred Architecture Debt Carries An Owner And An Expiry

Phase 5 inventoried but did **not** implement three convergence domains: the Claude adapter, `OpenCodeService`, and settings plugin-type coupling. Every deferred card is retained by its current owner with a hard expiry of **2026-09-01** and an explicit re-entry gate: a fresh complete inventory + independent read-only review + merge checkpoint, **or** an explicitly approved deferred-owner/expiry extension, before any source move. Neither expiry passage nor a passing test authorizes implementation. The single pre-existing `dependencyException` (`task15-chat-runtime-composition-scc-member`) retires only when its implemented child slice proves via contract tests + dependency gate.

## Acceptance Criteria

This requirement is satisfied when:

1. `npm run verify` includes graph freshness, module-doc, owner-manifest/boundaries/dependency-direction/cycles/approvals, devlog-order, lint, typecheck, test, and build gates.
2. `graphify-out/` is current after `src/` or config/tool-envelope changes and stale graph state fails fast (content-addressed digest).
3. Agents can answer "where should I edit?" by following `AGENTS.md` -> `inspect:owner` -> `GRAPH_REPORT.md` -> `docs/modules/**`.
4. New maintainability work reduces ownership, import surface, duplicate truth, or verification ambiguity.
5. No maintainability lane creates thin helper fragmentation without a durable behavior owner.
6. No `OWNER_GUARD_APPROVED` / `GUARD_TARGETS` / `--approved` free-text waiver / hard-coded path guard survives in scripts, hooks, CI, or active docs (Phase 2 Task 9 retirement verified at Phase 6 Task 20).
7. Deferred architecture debt (Phase 5) carries an owner and a hard expiry; no implementation proceeds without a fresh review checkpoint.

## Non-Goals

- No automatic git hook that rewrites graph artifacts after every commit or checkout.
- No large manually curated architecture map that duplicates graphify and module docs.
- No whole-repo graph artifact for the committed baseline.
- No line-count-only refactor queue.
- No revival of the pre-Phase-6 unattended maintainability autopilot as a second architecture roadmap; its historical evidence stays archived and out of the default reading chain.
