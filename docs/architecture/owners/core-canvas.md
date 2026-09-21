# Owner: core.canvas
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/canvas/**`

## Responsibilities
- R-C5: `.canvas` JSON schema with lenient parse (unknown-field preservation for round-trip fidelity), deterministic serialization (fixed key order + 2-space indent, matching Obsidian's own writer) and the strict `assertWritableDocument` write gate
- R-C5: deterministic grid/grouped layout (360×160 nodes, 60px gutters, 40px group padding; no force-directed layout, no randomness, golden-testable)
- R-C5: canvas generation — in-memory document build, double validation before disk contact, name-collision suffixing (` 2`, ` 3`…), single verified `vault.create` through the injected `CanvasVaultPort` with failure reclaim so a half-written `.canvas` is never left behind (acceptance 4)
- R-C5: canvas node write service — the runtime confirmation gate decision (pure), the text-node `setData`/`requestSave` write-back with a snapshot dirty check, and the file-node `vault.process` dirty-checked write

## Canonical state (truth home)
- none at rest: this owner is a pure computation + vault-port subsystem; all persistence is the vault's own (`.canvas` files via `vault.create`/Canvas save pipeline)

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/canvas/index.ts` (barrel; consumers import nothing else)

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core.opencode`, `core.agents`, `core.storage`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.canvas-integration`, `app.composition`, `core.storage`

## Focused tests
- `tests/unit/core/canvas/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run check:module-docs`.

## Hard invariants
- **Round-trip fidelity:** parse preserves unknown fields (real canvases carry namespaced extras); serialize is deterministic; a document that fails `assertWritableDocument` never reaches the disk.
- **Failure leaves nothing:** generation validates in memory, creates exactly once, and trashes a file a failed `create` may have left behind.
- **The only `.canvas`-mutating call path is `writeTextNode`** (`setData` + `requestSave`, Canvas's own save pipeline); the plugin never writes the canvas file by hand, and the dirty check refuses drifted nodes.
- **The runtime gate is honest:** unproven capabilities are treated as absent; the decision carries reasons for the settings debug surface.

## Registration rationale (2026-09-18, R-C5)
The design (flowtext-c5-design §3.0) sanctioned a new owner for the same reason as `core.pdf`: a real subsystem (schema + layout + atomic-write semantics + gate decision) that candidate hosts cannot take — `core.storage` owns revert snapshots, not canvas JSON semantics; `feature.canvas-integration` is the foreign-host UI bridge and must not own the write contract; putting the schema into `app.composition` would grow `main.ts` runtime ownership. This is the sanctioned high-risk isolation provision, not a thin adapter.
