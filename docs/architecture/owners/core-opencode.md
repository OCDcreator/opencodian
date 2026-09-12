# Owner: core.opencode

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/opencode/**`

## Responsibilities
- OpenCode hybrid facade (SDK v2 primary, legacy HTTP/SSE fallback)
- canonical session/message/part state in OpenCodeSessionStateStore
- streaming, sync events, lifecycle, catalog, capability and server management

## Canonical state (truth home)
- OpenCode canonical session/message/part state
- OpenCode streaming/lifecycle coordinators
- OpenCode server lifecycle

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/opencode/index.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/OpenCodeSessionStateStore.ts`
- `src/core/opencode/ServerManager.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-shell`, `core.opencode-diagnostics`
- **Delegates to:** `core.opencode-diagnostics`

## Focused tests
- `tests/unit/core/opencode/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Recent change notes
- **Reasoning-part projection:** `OpenCodeMessageNormalizationMapper` copies the server reasoning part `id` into persisted thinking `ContentBlock.partId`. The mapper remains the canonical history-to-chat projection seam; UI owners consume the identity without deriving positional replacement keys.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- Reasoning stream whitespace is semantic content after a reasoning part has begun: preserve standalone spaces/newlines from both `message.part.delta` and `message.part.updated` so Markdown paragraphs, indentation, and ordered lists are not joined before the shared chat renderer sees them. Suppress only leading whitespace that would create an empty thinking block.
- 2026-09-08：permission responder 收敛到 SDK v2 `permission.reply`；deprecated `permission.respond`、`respondToSessionPermission` facade/hub 路径及能力注册均已移除。

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.opencode retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.
