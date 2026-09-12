# Owner: shared.utils-misc

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `shared` (may import layers: shared)
- **Risk:** low
- **Include:** `src/utils/index.ts`, `src/utils/editorSelectionHighlight.ts`

## Responsibilities
- miscellaneous shared utilities not yet promoted to a dedicated owner

## Entrypoints
- `src/utils/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Selection highlight writes are idempotent against the live CodeMirror StateField. Unchanged ranges and already-empty clears must not dispatch, and editor reconfiguration must not leave a stale installation cache.
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. shared.utils-misc retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.
