# Owner: core.runtime

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/runtime/**`

## Responsibilities
- startup bootstrap coordination and performance tracing
- settings runtime coordination (theme/appearance composition and persistence)

## Canonical state (truth home)
- startup performance trace
- settings runtime coordinator state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/runtime/OpenCodianStartupCoordinator.ts`
- `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`, `core.config`, `core.opencode`, `core.storage`, `core.theme`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `app.runtime`, `feature.chat-shell`

## Focused tests
- `tests/unit/core/runtime/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
