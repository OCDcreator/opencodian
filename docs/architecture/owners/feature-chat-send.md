# Owner: feature.chat-send

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** _(reference-only dependency alias; owns no paths)_

## Responsibilities
- logical send-pipeline dependency alias: actual files and canonical state live in feature.chat-runtime; referenced only by allowedOwnerDependencies to keep the dependency surface readable

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.agents`, `core.backend`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-runtime`, `core.agents`

## Required gates
Run before merge: `npm run typecheck`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-send retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.
