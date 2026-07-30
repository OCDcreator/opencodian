# Owner: core.opencode-diagnostics

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/opencode/diagnostics/**`

## Responsibilities
- OpenCode backend trace service, store, report builder and redactor
- trace channel lifecycle for OpenCode diagnostics

## Canonical state (truth home)
- OpenCode trace service/store

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/opencode/diagnostics/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.diagnostics`, `core.backend-diagnostics`, `feature.chat-diagnostics`

## Focused tests
- `tests/unit/core/opencode/diagnostics/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
