# Owner: app.memory-runtime

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `app` (may import layers: shared, core, feature, app)
- **Risk:** medium
- **Include:** `src/app/memory/**`

## Responsibilities
- compose the backend-neutral memory runtime: vault-local or shared external filesystem adapter (per `memoryExternalRoot`, with `~` expansion for cross-host synced settings), settings snapshot, OpenCode-backed extraction/reflection model invoker
- observe turn-settled and compaction signals and schedule fail-soft per-turn extraction and compaction reflection
- register memory maintenance commands (status/lint/list/forget) against the coordinator
- when a shared external root plus a git remote URL are configured, sync the whole memory tree through `MemoryGitSyncService` (shared protocol with opencode-zmem: cross-plugin lock, main branch, identical ignore rules)

## Canonical state (truth home)
- `MemoryRuntimeCoordinator` instance (owns extraction debounce state and transcript watermarks)

> This mirrors the `app.diagnostics-runtime` composition pattern: `main.ts` never constructs memory services directly; the coordinator constructs and injects them on the plugin's behalf.

## Entrypoints
- `MemoryRuntimeCoordinator` (`src/app/memory/MemoryRuntimeCoordinator.ts`)

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.i18n`, `core.memory`, `core.opencode`, `core.storage`, `core.types`
- **Forbidden dependencies:** `feature.chat-runtime`, `feature.chat-services`, `core.backend`, `core.backend-pi` (no adapter imports; chat wiring flows the other way through host ports)
- **Adjacent owners:** `app.composition`, `core.memory`

## Focused tests
- `tests/unit/app/memory/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Every entry point is fail-soft: a memory failure must never surface in or block a user turn. Injection planning, extraction, reflection and metrics writes all swallow-and-log.
- The coordinator is the only place allowed to bind `core.memory` ports to concrete infrastructure (Obsidian vault adapter filesystem, `OpenCodeService` temp-session model invoker).
- The vault filesystem port consumes Obsidian's `DataAdapter.list()` as `ListedFiles` (plain full-path strings, not TFile objects); `listFiles` maps entries to basenames before returning.
- Shared-store mode routes buckets to `<root>/projects/<slug>-<hash16>/memory` (the opencode-zmem / ZCode workspace-memory layout) through `ExternalMemoryFileSystem`; the metrics journal always stays in the vault, and a root switch resets per-conversation epoch state.
- Git sync is fail-soft and lock-serialized with opencode-zmem on the same tree; per-machine diagnostics (`.last-injection.json`, `metrics.jsonl`) never enter the repository.
- The model invoker uses throwaway sessions (`setCurrent: false`, deleted in `finally`) so memory distillation never pollutes the user's conversation list.
- Metrics (`metrics.jsonl`) are append-only diagnostics under the store root; they are never cleaned automatically.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
