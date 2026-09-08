# Owner: app.composition

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** high
- **Include:** `src/main.ts`

## Responsibilities
- plugin entry point, composition and Obsidian registration
- startup storage load, settings normalization, locale, command registration
- view registration and lifecycle wiring

## Canonical state (truth home)
- OpenCodianPlugin instance

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/main.ts`

## Dependency surface
- **Allowed owner dependencies:** `core.runtime`, `core.opencode`, `core.agents`, `core.storage`, `core.config`, `feature.chat-shell`, `feature.settings-shell`, `app.diagnostics-runtime`, `app.runtime`
- **Adjacent owners** (prefer editing these when out of scope): `core.runtime`, `core.opencode`, `app.diagnostics-runtime`, `app.runtime`

## Focused tests
- `tests/unit/entry-point/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## SDK upgrade integration notes
- 2026-09-02: main.ts 为 ClaudeCodeAdapter 接入 SDK 0.3.252 `onUserDialog` 宿主回调（`refusal_fallback_prompt` 对话框经共享问题卡渲染，cancel 一律映射 CLI 默认行为）并声明 `supportedDialogKinds`；fail-safe——未接线路径行为不变。

## Pi owner boundary review (2026-09-08)

Bootstrap supplies only the Pi settings callback to adapter registration. Pi processes, protocol compatibility and session state belong to core.backend-pi.
