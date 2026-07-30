# Owner: shared.foundation

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** low
- **Include:** `src/shared/index.ts`, `src/shared/brandingWordmark.ts`, `src/shared/contextPath.ts`, `src/shared/debugModules.ts`, `src/shared/diagnosticSecretSanitizer.ts`, `src/shared/logger.ts`, `src/shared/obsidianContext.ts`, `src/shared/toolExecution.ts`, `src/shared/toolIdentity.ts`, `src/shared/TooltipLayerController.ts`, `src/shared/vault.ts`

## Responsibilities
- shared cross-cutting primitives: logging, context paths, vault access, tool identity
- diagnostic secret sanitizer primitive

## Canonical state (truth home)
- shared logger instance

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/shared/index.ts`

## Dependency surface
- **Allowed owner dependencies:** _(none declared)_
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.diagnostics`, `shared.modals`

## Focused tests
- `tests/unit/shared/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
