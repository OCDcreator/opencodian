# Owner: feature.chat-shell

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/**`

## Responsibilities
- main chat view runtime (OpenCodianView): ItemView lifecycle, DOM mount, tab/stream forwarding
- concurrent tab/session streaming orchestration
- conversation reload hydration/auth-sync

## Canonical state (truth home)
- OpenCodianView tab/stream/conversation runtime state
- chat view scroll-restore state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/OpenCodianView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.opencode`, `core.agents`, `core.config`, `core.storage`, `core.runtime`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-rendering`, `feature.chat-ui`, `feature.chat-tabs`, `feature.chat-diagnostics`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-runtime`, `feature.chat-services`, `feature.settings-debug`
- **Delegates to:** `feature.chat-rendering`, `feature.chat-runtime`, `feature.chat-services`, `feature.chat-tabs`, `feature.chat-ui`, `feature.chat-demos`, `feature.chat-diagnostics`, `feature.chat-misc`

## Focused tests
- `tests/unit/features/chat/OpenCodianView*.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Recent change notes
- **Turn change record visibility:** the chat plugin port exposes the global `showTurnChangeRecords` display preference to the runtime without making the shell a second store for persisted notices.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
