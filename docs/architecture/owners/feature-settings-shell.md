# Owner: feature.settings-shell

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/**`

## Responsibilities
- settings tab shell, router, coordinator and shared controls
- settings normalization and view registration

## Canonical state (truth home)
- OpenCodianSettings normalized state
- settings section coordinator state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/OpenCodianSettingsView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`, `core.config`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.settings-debug`, `feature.settings-model-catalog`
- **Delegates to:** `feature.settings-debug`, `feature.settings-model-catalog`, `feature.settings-claude`, `feature.settings-codex`, `feature.settings-opencode`, `feature.settings-style`, `feature.settings-mcp`, `feature.settings-agents`, `feature.settings-plugin`

## Focused tests
- `tests/unit/features/settings/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
