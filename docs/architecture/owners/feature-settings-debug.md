# Owner: feature.settings-debug

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/SettingsDebugSection.ts`, `src/features/settings/debug/**`

## Responsibilities
- shared debug section shell/router, plugin export actions, and platform/path/action/module helpers
- complete OpenCode trace debug panel: settings, status, actions, catalog, and narrow diagnostics-port wiring
- Codex and Claude debug workbenches remain in `SettingsDebugSection` pending their later panel slices

## Canonical state (truth home)
- debug section tab shell/router state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/SettingsDebugSection.ts`
- `src/features/settings/debug/OpenCodeDebugPanel.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode-diagnostics`, `core.backend-diagnostics`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `feature.chat-diagnostics`

## Focused tests
- `tests/unit/features/settings/SettingsDebugSection*`
- `tests/unit/features/settings/OpenCodeDebugPanel*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- `SettingsDebugSection` owns the shared source-tab shell/router, plugin export, and shared platform/path/action/module helpers.
- `OpenCodeDebugPanel` is the complete OpenCode panel owner for its settings/status/actions/catalog surface; it receives narrow typed ports and callbacks rather than the full plugin or trace service.
- Codex and Claude remain implemented inside `SettingsDebugSection` for this slice; this owner does not claim Codex or Claude panel modules yet.
- The three settings composition paths create the OpenCode diagnostics port at their boundary. The legacy non-tabbed attach Codex omission is unchanged.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
