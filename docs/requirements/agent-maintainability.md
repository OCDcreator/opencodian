# Agent-Oriented Maintainability Requirements

> Updated: 2026-04-27
>
> This document defines the maintainability requirements that help coding agents understand OpenCodian quickly and modify it safely. It complements `docs/status/development-maintainability-rules.md`: that file is the active guardrail checklist; this file explains the durable product and engineering requirement.

## Current Conclusion

OpenCodian already has enough documentation infrastructure that a separate, hand-maintained "agent entry map" should stay small. The durable source stack is:

1. `AGENTS.md` for first-stop rules and current hot paths.
2. `graphify-out/GRAPH_REPORT.md` for graph-level structure, god nodes, and communities.
3. `docs/modules/**` for file-level ownership and behavior.
4. `docs/status/development-maintainability-rules.md` for active maintainability gates.

The requirement is not to create another large parallel map. The requirement is to keep these sources fresh, connected, and enforced by checks so agents do not rely on stale mental models.

## Evidence From The Current Graph

The refreshed `src` graph (`2026-04-27`) covers 355 files, 4691 nodes, 10447 edges, and 48 communities. Its highest-connected nodes remain the main cognitive load centers:

- `t()`
- `OpenCodianView`
- `OpenCodeService`
- `OpenCodianPlugin`
- `ServerManager`
- `SettingsModelCatalogPresenter`
- `OpenCodeStreamingRuntimeCoordinator`
- `OpenCodeCatalogQueryCoordinator`
- `OpencodeConfigManager`
- `ConversationTabRuntimeCoordinator`

These nodes should guide maintainability work. A thick file is not automatically bad, and a small file is not automatically good; the priority is reducing unclear ownership, duplicate state, and unsafe edit surfaces around high-connection owners.

## Requirements

### R1. Agent Entry Sources Stay Layered

Agents must be able to build context in this order:

1. Read `AGENTS.md` for rules, commands, and high-risk areas.
2. Read `graphify-out/GRAPH_REPORT.md` before architecture or codebase questions.
3. Use `docs/modules/README.md` and mapped module docs for file-level behavior.
4. Use focused source inspection only after the routing sources point to the relevant owner.

Do not replace this layered flow with a large narrative architecture map unless the graph and module docs cannot answer a recurring question.

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
- devlog changes: `npm run check:devlog-order`
- TypeScript behavior changes: relevant focused Jest tests, then lint/typecheck/full tests
- runtime UI/settings/plugin behavior changes: build, Test Vault copy, and deployed `BUILD_ID` verification when required

## Acceptance Criteria

This requirement is satisfied when:

1. `npm run verify` includes graph freshness, module-doc, lint, typecheck, test, and build gates.
2. `graphify-out/` is current after `src/` changes and stale graph state fails fast.
3. Agents can answer "where should I edit?" by following `AGENTS.md` -> `GRAPH_REPORT.md` -> `docs/modules/**`.
4. New maintainability work reduces ownership, import surface, duplicate truth, or verification ambiguity.
5. No maintainability lane creates thin helper fragmentation without a durable behavior owner.

## Non-Goals

- No automatic git hook that rewrites graph artifacts after every commit or checkout.
- No large manually curated architecture map that duplicates graphify and module docs.
- No whole-repo graph artifact for the committed baseline.
- No line-count-only refactor queue.
