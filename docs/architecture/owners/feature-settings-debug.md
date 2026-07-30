# Owner: feature.settings-debug

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/SettingsDebugSection.ts`

## Responsibilities
- debug settings section: five debug source tabs, three backend trace workbenches, plugin export actions
- Claude session-trace controls inside claude-code debug block

## Canonical state (truth home)
- debug section tab shell/router state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/SettingsDebugSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode-diagnostics`, `core.backend-diagnostics`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `feature.chat-diagnostics`

## Focused tests
- `tests/unit/features/settings/SettingsDebugSection*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
