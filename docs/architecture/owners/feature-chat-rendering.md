# Owner: feature.chat-rendering

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/chat/autoScrollState.ts`, `src/features/chat/chatAppearance.ts`, `src/features/chat/composerContext.ts`, `src/features/chat/forkMessages.ts`, `src/features/chat/renderGroups.ts`, `src/features/chat/rendering/**`, `src/features/chat/userMessageActions.ts`, `src/features/chat/userMessageDisplay.ts`

## Responsibilities
- message render grouping, appearance, auto-scroll, collapsible sections
- user message actions/display and composer context state

## Canonical state (truth home)
- chat composer context state
- chat appearance settings snapshot

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/composerContext.ts`
- `src/features/chat/renderGroups.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-runtime`

## Focused tests
- `tests/unit/features/chat/rendering/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
