# Owner: shared.diagnostics

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** high
- **Include:** `src/shared/diagnostics/index.ts`, `src/shared/diagnostics/TraceRedactor.ts`, `src/shared/diagnostics/TraceReportBuilder.ts`, `src/shared/diagnostics/TraceStore.ts`, `src/shared/diagnostics/types.ts`

## Responsibilities
- shared diagnostics foundation: redaction, trace store, report builder
- backend-agnostic trace primitives reused by OpenCode/Codex/Claude trace services

## Canonical state (truth home)
- shared trace redactor
- shared trace store contract

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/shared/diagnostics/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`, `core.opencode-diagnostics`, `core.backend-diagnostics`

## Focused tests
- `tests/unit/shared/diagnostics/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
