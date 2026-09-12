# Owner: core.security

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/security/**`

## Responsibilities
- blocklist/security checks shared across the runtime

## Entrypoints
- `src/core/security/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.diagnostics`, `feature.chat-send`

## Focused tests
- `tests/unit/core/security/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.security retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.
