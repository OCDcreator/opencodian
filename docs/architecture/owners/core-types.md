# Owner: core.types

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** low
- **Include:** `src/core/types/**`

## Responsibilities
- core domain type definitions (chat, models, config, settings, permission, pricing, tools)

## Entrypoints
- `src/core/types/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.config`, `core.opencode`, `feature.settings-shell`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Turn change record contract:** a valid `noticeMeta.kind === 'turn-diff'` record owns its immutable snapshot and its user-message anchor inside `noticeMeta`; the top-level `ChatMessage.sourceMessageId` remains reserved for canonical message identity.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
