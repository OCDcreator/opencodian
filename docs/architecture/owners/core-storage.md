# Owner: core.storage
> 2026-09-21 (advantage-parity R-F2/R-F3)：会话 metadata sidecar 保真库内 Markdown `linkedNotePath`；EditRevertService/Store 在 round 结束冻结 post-image 基线供只读预览与冲突比较，并将新增 blob 纳入引用、字节预算和 GC。持久化/回退真值仍在本 owner，不由 UI 另建。
> 2026-09-21 (advantage-parity R-F7)：StorageService runtime.json 增 `environmentFingerprints` 读写（load 失败 null、save 失败 warn 不抛；R-F7 失效信号的数据面）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/storage/**`

## Responsibilities
- local-first persistence for conversations, theme backgrounds and provider-icon assets
- conversation metadata and full-message cache
- backend-neutral edit-revert snapshots: content-addressed checkpoint store, retention and vault write-back (R-B3)

## Canonical state (truth home)
- conversation store
- theme background storage
- edit-revert checkpoint rounds and content-addressed blobs (`.opencodian/checkpoints/`)

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/storage/index.ts`
- `src/core/storage/StorageService.ts`
- `src/core/storage/EditRevertService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.chat-shell`

## Focused tests
- `tests/unit/core/storage/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.storage retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

- 2026-09-18 (R-B3 编辑回退)：本 owner 新增编辑回退职责——`EditRevertService.ts`（编排：round 捕获、vault 事件漏斗、回退/恢复、保留淘汰）、`EditRevertStore.ts`（`.opencodian/checkpoints/` 内容寻址 blob 与 round JSON 的磁盘 IO）、`EditRevertVaultWriteback.ts`（唯一破坏性写缝：vault.process/create/trash + self-write guard）。feature 层只通过 `core.types` 的 `EditRevertServicePort` 消费；保留规划纯逻辑在 `shared.foundation` 的 `editRevertPlan.ts`。

- 2026-09-20 (advantage-parity R-D1)：本 owner 新增对话导出职责——`ConversationMarkdownExporter.ts`（会话 → vault Markdown 笔记：纯新增手动导出 + 默认关闭的自动导出刷新，附件内容寻址去重；私有状态 `.opencodian/conversation-export-state.json`）。文件名/路径清洗函数下沉到 `shared.foundation` 的 `vault.ts`（`sanitizeVaultFileBaseName` / `isSafeVaultRelativePath`，`ImageAssetStorage` 保留历史名再导出）。
