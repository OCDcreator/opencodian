# Owner: feature.chat-diagnostics

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts`, `src/features/chat/services/CodexDiagnosticsHostAdapter.ts`, `src/features/chat/services/ChatDiagnosticsCoordinator.ts`

## Responsibilities
- chat-side OpenCode, Codex, and Claude diagnostics state, menu routes, capture-token operations, and report/export callbacks
- `ChatDiagnosticsCoordinator` composition of the OpenCode port with Codex and Claude host adapters
- trace failure containment away from chat path

## Canonical state (truth home)
- chat diagnostics coordinator and host adapter state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts`
- `src/features/chat/services/CodexDiagnosticsHostAdapter.ts`
- `src/features/chat/services/ChatDiagnosticsCoordinator.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.backend-diagnostics`, `core.opencode-diagnostics`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `core.backend-diagnostics`, `feature.settings-debug`

## Focused tests
- `tests/unit/features/chat/ChatDiagnosticsCoordinator.test.ts`
- `tests/unit/features/chat/ChatDiagnosticsContract.test.ts`
- `tests/unit/features/chat/*DiagnosticsHostAdapter.test.ts`
- `tests/unit/features/chat/CodexDiagnosticsHost.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
