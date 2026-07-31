# Owner: feature.settings-debug

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/SettingsDebugSection.ts`, `src/features/settings/debug/**`

## Responsibilities
- shared debug section shell/router, plugin export actions, and platform/path/action/module helpers
- complete OpenCode trace debug panel: settings, status, actions, catalog, and narrow diagnostics-port wiring
- complete Codex trace debug panel: settings, status, actions, catalog, `captureContent` control, and narrow diagnostics-port wiring; this intermediate slice mounts it only from the tabbed debug route
- complete Claude Code debug panel: workbench DOM, console debug channels, independent session-trace settings/status/actions/catalog/filter, and narrow diagnostics-port wiring

## Canonical state (truth home)
- debug section tab shell/router state
- backend trace settings persisted in `OpenCodianPlugin.settings`; panels keep no second settings copy
- trace status and catalog state owned by app diagnostics services and exposed through narrow ports

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/SettingsDebugSection.ts`
- `src/features/settings/debug/OpenCodeDebugPanel.ts`
- `src/features/settings/debug/CodexDebugPanel.ts`
- `src/features/settings/debug/ClaudeCodeDebugPanel.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode-diagnostics`, `core.backend-diagnostics`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `feature.chat-diagnostics`

## Focused tests
- `tests/unit/features/settings/SettingsDebugSection*`
- `tests/unit/features/settings/OpenCodeDebugPanel*`
- `tests/unit/features/settings/CodexDebugPanel*`
- `tests/unit/features/settings/ClaudeCodeDebugPanel*`

## Required gates
Run before merge: `npm run typecheck`, `npm run check:module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- `SettingsDebugSection` owns the shared source-tab shell/router, plugin export, and shared platform/path/action/module helpers.
- `OpenCodeDebugPanel` is the complete OpenCode panel owner for its settings/status/actions/catalog surface; it receives narrow typed ports and callbacks rather than the full plugin or trace service.
- `CodexDebugPanel` is the complete Codex trace panel owner for its settings/status/actions/catalog surface, including `captureContent`; it receives narrow typed ports and callbacks rather than the full plugin or trace service.
- The Codex panel is currently mounted only by `SettingsDebugSection.attachTabbed()`. The legacy non-tabbed `attach()` path still omits Codex; this slice does not fix or delete that behavior.
- `ClaudeCodeDebugPanel` is the complete Claude workbench owner. It receives narrow settings/diagnostics ports and section callbacks rather than the full plugin, trace service, store, or report builder. `debugChannels` for console logs and `sessionTrace.consoleChannels` for trace capture remain independent.
- The three settings composition paths create OpenCode, Codex, and Claude diagnostics ports at their boundaries. The adapters preserve app-owned service/store/report ownership and expose no mutable service map.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
