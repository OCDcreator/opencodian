# Owner: feature.canvas-integration
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/canvas-integration/**`

## Responsibilities
- R-C5: integration into Obsidian's (unexported) canvas view — per-leaf runtime confirmation gate probe, floating selection-menu button and context-menu/command entries, honest degradation when the gate fails
- R-C5: canvas generation flow — note picking (R-A7 picker / R-B2 groups), the mode choice (file-reference default, optional read-only AI topic split), and `EditRevertService.registerPluginCreatedAsset` registration of the created file
- R-C5: node-level AI rewrite orchestration on the read-only aux contract (`AgentAuxQueryCapability` + blocking `findWriteToolCalls` audit + inline-edit response parser reuse) with a preview-confirm modal before any write-back

## Canonical state (truth home)
- per-canvas-leaf bridges (gate decision, MutationObserver, menu patch) held by `CanvasIntegrationController`; dropped on `detach()`

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/canvas-integration/CanvasIntegrationController.ts` (composed only from `app.composition`, which registers the `canvas-generate-from-notes` and `canvas-ai-edit-node` commands and injects the Notice sink)

## Non-obvious invariants
- **The runtime gate decides registration.** When the read side (`view.canvas` / `getData` / document shape) cannot be proven, the controller mounts NOTHING for that leaf and records the reasons; the command answers with an honest notice. No silent no-op, no fake success (§6.7).
- **Degradation ladder A→B→C→D** (design §3.4): A floating-menu button + write-back; B command entry reading `canvas.selection`; C `getData()`-based node picker (deliberately independent of the selection Set, §7-U4); D write surface missing → rewrite result is copy-only with an explicit notice.
- **Undo honesty (E2):** text-node `setData` writes are outside the R-B3 revert funnel (markdown-only); the preview modal says Ctrl+Z coverage is unverified. File-node writes run `beginBatchCapture → notePluginWrite → endBatchCapture`, and an unavailable revert surface refuses the write instead of writing unrevertable content.
- **The feature never edits the canvas by hand:** the only canvas mutation is core.canvas's `writeTextNode` (Canvas's own save pipeline); the only note mutation is one `vault.process`.

## Dependency surface
- **Allowed owner dependencies:** `core.canvas`, `core.agents`, `core.types`, `shared.foundation`, `shared.i18n`, `feature.inline-edit`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `core.canvas`, `feature.inline-edit`, `app.composition`

## Focused tests
- `tests/unit/features/canvas-integration/**` (real `EditRevertService` on the shared in-memory vault harness)

## Required gates
Run before merge: `npm run typecheck`, `npm run check:module-docs`.

## Registration rationale (2026-09-18, R-C5)
New owner per flowtext-c5-design §3.0, mirroring `feature.inline-edit`: UI mounted inside a foreign host view (Obsidian's canvas) with its own gate, entries and modal surface. Deliberately NOT inside `feature.chat-*` (the chat owners must not absorb foreign-view runtime) and not in `app.composition` (composition only). The aux session and vault snapshot seams are injected through narrow ports, so the owner stays backend-agnostic and testable without Obsidian.
