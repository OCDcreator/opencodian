# Owner: core.config
> 2026-09-21 (advantage-parity R-F8)：catalog 边界新增 applyContextWindowOverrides + ModelConfigService 四面施加 + 设置访问器。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/config/**`

## Responsibilities
- merge local config and server catalogs (ModelConfigService, OpencodeConfigManager)
- model catalog state, selection, pricing, formatter and MCP config
- slash command catalog and plugin management service

## Canonical state (truth home)
- model catalog assembly (baseEffective vs effective)
- opencode config manager state
- slash command catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/config/index.ts`
- `src/core/config/ModelConfigService.ts`
- `src/core/config/OpencodeConfigManager.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-model-catalog`, `feature.chat-shell`

## Focused tests
- `tests/unit/core/config/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.config retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Startup non-blocking invariant (2026-09-10)

`ModelPricingService.load()` must only read the local cache synchronously; the 24h models.dev auto-refresh runs fire-and-forget in the background. Never `await` a network catalog fetch inside plugin `onload` — it once blocked startup for ~3.5s on a slow link. Explicit user-triggered `refresh()` (settings pricing modal) stays awaited.

Concurrent automatic and manual `refresh()` calls share one Promise through fetch and persistence; clear that Promise on either success or failure. `onCatalogUpdated` exposes a disposable event over the canonical in-memory catalog. Publish before persistence so consumers see usable prices even if saving fails; listener and diagnostic failures cannot break refresh or other consumers. Views own subscriptions and update current unavailable estimates without rewriting already priced history.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。
