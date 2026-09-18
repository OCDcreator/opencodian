# Owner: app.batch-organize

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** medium
- **Include:** `src/app/batchOrganize/**`

## Responsibilities
- compose the R-B5 batch note organizing runtime: task-template picker, parameter form, real preview and confirm modal
- fail-closed execution handshake: the confirmed preview signature is recomputed from live vault state right before any write; any drift aborts with zero writes
- forced R-B3 snapshots for a plugin-initiated batch: `beginBatchCapture` pre-images every affected file before the first write; refusal to execute when the snapshot layer is unavailable or disabled
- vault writes go only through `app.fileManager.renameFile` (moves/renames — references update automatically) and `app.fileManager.processFrontMatter` (property edits — YAML formatting and property types survive)

## Canonical state (truth home)
- `BatchOrganizeCoordinator` instance (owns the last batch id; the preview/execute handshake itself is stateless)

> Mirrors the `app.obsidian-tooling` composition pattern: `main.ts` only constructs the coordinator and registers the two launch commands; all behavior lives here and in the pure planner (`src/shared/batchOrganizePlan.ts`, `shared.foundation`).

## Entrypoints
- `BatchOrganizeCoordinator`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.i18n`, `core.types`
- **Forbidden dependencies:** `feature.chat-runtime`, `feature.chat-services`, `core.backend`, `core.backend-pi` (the batch flow is plugin-native and backend-independent; R-B3 is consumed only through the `EditRevertServicePort` declared in `core.types`)
- **Adjacent owners:** `app.composition`, `core.storage`

## Focused tests
- `tests/unit/app/batchOrganize/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- No write without a confirmed preview: the modal's confirm carries the preview signature, and `execute()` recomputes the plan first — a stale signature means the vault changed and the batch aborts with zero writes (fail closed, requirement acceptance 3).
- No write without a forced snapshot: when `beginBatchCapture` is missing, disabled, or fails, the batch refuses to run (mechanism guarantee, requirement §11.3 — not prompt wording).
- Never overwrite: planned moves/renames into occupied paths are excluded at plan time (`conflicts`) and re-checked at execution time.
- Template labels are i18n product assets (`batchOrganize.*` in `zh.ts`/`en.ts`); no user-facing wording lives in code.
- The batch modal is the immediate revert entry after completion; the "revert last batch" command (with confirm modal) is the durable entry. Batch rounds use synthetic conversation ids (`batch-organize-…`) so they never surface in a chat conversation's sidebar.

## Change log
- 2026-09-18 (FlowText R-B5): owner registered with the initial coordinator + organize/confirm modals.
