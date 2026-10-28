# Owner: app.pdf-runtime
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** low
- **Include:** `src/app/pdf/**`

## Responsibilities
- bind the `core.pdf` `PdfIndexFs` port to the Obsidian vault adapter: read-only PDF listing/reads, index writes confined to `.opencodian/pdf-index/**`, atomic tmp→rename with tmp cleanup on failed rename

## Canonical state (truth home)
- the `PdfIndexFileSystem` instance bound to the plugin app (composed once by `main.ts`)

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/app/pdf/PdfIndexFileSystem.ts`

## Dependency surface
- **Allowed owner dependencies:** `core.pdf`, `shared.foundation`
- **Forbidden dependencies:** `feature.chat-runtime`, `feature.chat-services`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `core.pdf`

## Focused tests
- `tests/unit/core/pdf/**` (the port contract is exercised through the service tests with an in-memory double)

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- The adapter mirrors the R-C1 `VaultIndexFileSystem`: user content is read-only; the only writes land under the plugin-private dot directory, which Obsidian never lists or searches.
- Every index write is atomic (`<path>.tmp` → rename); a failed rename removes the tmp residue.

- 2026-09-18 (R-C4): owner registered alongside `core.pdf`; mirrors the `app.memory-runtime`/`core.memory` split.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `app.pdf-runtime` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/app/pdf`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `app.pdf-runtime` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
