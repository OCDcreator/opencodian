# Owner: app.runtime

> **Layer:** `app` (may import layers: shared, core, feature, app)
> **Risk:** high
> **Include:** `src/app/runtime/**`

## Responsibilities

- cross-view refresh and model refresh scheduling
- slash command catalog invalidation
- deferred runtime warmup 与 session-bootstrap readiness
- 启动期 plugin update check

## Canonical state (truth home)

- `PluginRuntimeCoordinator` 的 model refresh animation-frame state
- `PluginRuntimeCoordinator` 的 deferred warmup timer 与 promise state

> 这些是 coordinator 的调度状态；插件全局 settings、OpenCode service、view/session 状态仍分别由入口、core 与 chat owners 持有，不在此复制真值。

## Entrypoints

- `src/app/runtime/PluginRuntimeCoordinator.ts`

## Dependency surface

- **Allowed owner dependencies:** `shared.foundation`, `shared.i18n`, `core.opencode`, `core.types`, `core.update`, `feature.chat-shell`, `feature.chat-runtime`
- **Forbidden dependencies:** none
- **Adjacent owners** (prefer editing these instead when out of scope): `app.composition`, `core.runtime`, `feature.chat-shell`

## Focused tests

- `tests/unit/app/runtime/**`

## Required gates

Run before merge: `npm run typecheck`, `npm run check:module-docs`, `npm run build`.

## Hard invariants

- 仅通过 host seam 触发入口拥有的服务能力，不复制 plugin 全局真值。
- `dispose()` 必须清理 model refresh frame 与 deferred warmup timer，且不得留下未受控的 warmup promise。
- 不把 view-level rendering、OpenCode server lifecycle 或 plugin update persistence 搬入本 owner。
