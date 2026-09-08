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

## Recent change notes
- **Collapsible disposal:** `setupCollapsible` returns an idempotent dispose handle that disconnects its ResizeObserver and removes toggle listeners; wrappers register in a module-level WeakMap so `disposeCollapsiblesWithin(rootEl)` can release every collapsible before a message subtree is cleared or replaced (undisposed observers are a potential retention risk).
- **Expansion-state boundary:** persisted block expansion state belongs to `AssistantShellViewHostAdapter` in `feature.chat-runtime`; this rendering owner continues to provide disposal primitives only and must not become a second state store.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-rendering retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.
