# Owner: core.backend

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/agents/backend/**`

## Responsibilities
- agent backend adapters and transports for OpenCode, Codex and Claude
- Claude settings source, project resource secure write, configuration archive
- backend model catalog and routing

## Canonical state (truth home)
- agent service registry instances
- Claude/Codex/OpenCode adapter state
- backend model catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/backend/index.ts`
- `src/core/agents/backend/ClaudeCodeAdapter.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `src/core/agents/backend/OpenCodeAdapter.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.agents`, `core.backend-diagnostics`, `feature.chat-send`
- **Delegates to:** `core.backend-diagnostics`

## Focused tests
- `tests/unit/core/agents/backend/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
