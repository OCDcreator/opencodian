# Owner: shared.utils-streaming

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** medium
- **Include:** `src/utils/streaming/**`

## Responsibilities
- tool kind/icon/summary rules and streaming render primitives
- MCP tool summary classification

## Canonical state (truth home)
- tool kind/summary classification rules

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/utils/streaming/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-markdown`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`, `feature.chat-rendering`

## Focused tests
- `tests/unit/utils/streaming/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Streaming markdown frame budget:** `MarkdownRenderScheduler` coalesces cumulative markdown re-renders into a shared minimum interval (`STREAMING_MARKDOWN_RENDER_MIN_INTERVAL_MS = 96`): leading-edge render, at most one trailing render per interval, `flush()` at stream boundaries, `cancel()` on teardown. `StreamController`, `ThinkingBlockRenderer` (per-state schedulers via WeakMap) and the chat pseudo-stream reveal render through it instead of re-rendering full markdown per chunk.
- **Lazy expanded-content + expansion-state callbacks (persisted path):** `ThinkingBlockRenderer.renderStored` and `ToolCallRenderer.render` accept a `lazy` option (persisted/history restore path only; streaming stays eager) so collapsed blocks defer their full markdown / expanded-content render until first expansion, then reuse it. Both also accept `getInitialExpanded` / `onExpandedChange` callbacks supplied by the feature runtime; the renderers themselves stay free of any feature-layer state dependency.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
