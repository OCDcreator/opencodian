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
