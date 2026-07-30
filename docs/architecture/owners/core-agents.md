# Owner: core.agents

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/agents/**`

## Responsibilities
- agent capability, catalog and invocation service
- child session graph and system agent guards

## Canonical state (truth home)
- agent service registry
- agent capability catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/agents/index.ts`
- `src/core/agents/AgentInvocationService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.backend`, `feature.chat-send`, `feature.chat-shell`
- **Delegates to:** `core.backend`, `core.backend-diagnostics`

## Focused tests
- `tests/unit/core/agents/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
