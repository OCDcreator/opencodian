# Owner: feature.chat-misc

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** low
- **Include:** `src/features/chat/services/ChatVisualDemoCoordinator.ts`

## Responsibilities
- chat visual demo coordinator wiring

## Entrypoints
- `src/features/chat/services/ChatVisualDemoCoordinator.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `feature.chat-demos`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-demos`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
