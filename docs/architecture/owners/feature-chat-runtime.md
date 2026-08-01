# Owner: feature.chat-runtime

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/runtime/**`

## Responsibilities
- chat runtime coordinators: send pipeline, streaming, background tasks, sync load, tab activation
- assistant/user message renderers, permission and question inline cards

## Canonical state (truth home)
- send pipeline runtime state
- background task stream/indicator state
- conversation sync load/hydration state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/BackgroundTaskIndicatorCoordinator.ts`
- `src/features/chat/runtime/ChatRuntimeComposition.ts` — composition owner that assembles the full chat runtime (surface/identity/render/background/conversation/interaction phases) into a single `ChatRuntime` struct the view destructures. Owns no disposal; receives the view only as the structural `ChatRuntimeCompositionHost`. See Task 15.

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-streaming`, `core.types`, `core.agents`, `core.opencode`, `feature.chat-services`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-services`

## Focused tests
- `tests/unit/features/chat/runtime/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
