# Owner: feature.chat-appearance

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** low
- **Include:** _(reference-only dependency alias; owns no paths)_

## Responsibilities
- logical chat-appearance dependency alias: actual files and canonical state live in feature.chat-rendering; referenced only by allowedOwnerDependencies

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-glass`, `core.theme`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-rendering`, `feature.settings-style`

## Required gates
Run before merge: `npm run typecheck`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
