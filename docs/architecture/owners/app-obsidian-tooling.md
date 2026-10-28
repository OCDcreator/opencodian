# Owner: app.obsidian-tooling
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** medium
- **Include:** `src/app/obsidianTooling/**`

## Responsibilities
- compose the R-B4 tooling runtime: gate provisioning into `.opencodian/obsidian-tooling/`, request watcher and CLI probe cache
- lifecycle keyed off `obsidianToolingMode`: off means no probing, no injection, no watchers (zero cost — the requirement's default)
- fail-closed confirmation intake: a real modal dialog per request; dismissal/Esc counts as deny; stale requests expire; malformed requests are answered `invalid` so the polling wrapper stops early
- backend-neutral injection plan consumed by the chat send pipeline through the plugin field (same options-bag seam as the memory injection)

## Canonical state (truth home)
- `ObsidianToolingCoordinator` instance (owns gate/watcher/probe state, the pending request queue and per-conversation injection epochs)

> Mirrors the `app.memory-runtime` composition pattern: `main.ts` only constructs (`initObsidianToolingRuntime`) and disposes; the chat runtime and settings surface consume the coordinator through the plugin field.

## Entrypoints
- `ObsidianToolingCoordinator`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.i18n`, `core.obsidian-tooling`, `core.types`
- **Forbidden dependencies:** `feature.chat-runtime`, `feature.chat-services`, `core.backend`, `core.backend-pi` (no adapter imports; chat wiring flows the other way through host ports)
- **Adjacent owners:** `app.composition`, `core.obsidian-tooling`

## Focused tests
- `tests/unit/app/obsidianTooling/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Mode `off` is a zero-cost steady state: `applySettings()` tears the watcher down, drops probe state and clears epoch maps; nothing writes to the vault.
- Every request intake path is fail-closed: malformed → `invalid`, unanswered past expiry → `expired`, modal dismissal → `deny`. The wrapper never sees an ambiguous answer (unreadable decision → its own fail-closed exit 5).
- Decisions are written through the vault adapter into the plugin data dir (`.opencodian/…`), consistent with the R-B3/StorageService dotfolder convention; processed files are cleaned up after a grace period.
- The CLI probe result feeds both the settings status row and the injection variant: when the CLI is unavailable the model is told the capability is UNAVAILABLE (honest, §6.7), and the settings UI shows install guidance — never a silent failure.
- Windows/mobile are surfaced as unsupported platforms with explicit UI copy; the capability stays off instead of degrading silently.

## Change log
- 2026-09-18 (FlowText R-B4): owner registered with the initial coordinator + approval modal.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `app.obsidian-tooling` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/app/obsidianTooling`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `app.obsidian-tooling` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
