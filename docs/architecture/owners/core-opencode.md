# Owner: core.opencode

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/opencode/**`

## Responsibilities
- OpenCode hybrid facade (SDK v2 primary, legacy HTTP/SSE fallback)
- canonical session/message/part state in OpenCodeSessionStateStore
- streaming, sync events, lifecycle, catalog, capability and server management

## Canonical state (truth home)
- OpenCode canonical session/message/part state
- OpenCode streaming/lifecycle coordinators
- OpenCode server lifecycle

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/opencode/index.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionStateStore.ts`
- `src/core/opencode/ServerManager.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-shell`, `core.opencode-diagnostics`
- **Delegates to:** `core.opencode-diagnostics`

## Focused tests
- `tests/unit/core/opencode/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
