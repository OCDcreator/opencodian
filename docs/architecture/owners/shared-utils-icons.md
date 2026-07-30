# Owner: shared.utils-icons

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** medium
- **Include:** `src/utils/icons/**`

## Responsibilities
- provider icon resolution spanning LobeHub, builtin and custom sources
- icon asset cache lifecycle

## Canonical state (truth home)
- provider icon registry
- provider icon asset cache

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/utils/icons/index.ts`
- `src/utils/icons/ProviderIconService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`, `feature.settings-model-catalog`

## Focused tests
- `tests/unit/utils/icons/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
