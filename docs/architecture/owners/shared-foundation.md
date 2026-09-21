> 2026-09-18 (FlowText parity R-A7): `parseObsidianContextTag` accepts `kind="folder"` so directory context tags round-trip losslessly.
> 2026-09-21 (advantage-parity R-E4)：attachment 透传 retrievalChannel。
> 2026-09-21 (advantage-parity R-E5)：obsidianContext mime 映射新增 .base。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E6)：新增 shared/tokenEstimate.ts（启发式估算，定位数字非计费数字）。
> 2026-09-21 (advantage-parity R-E1)：obsidianContext 新增 buildUrlContextTag/Body 与 attachment 的 url 元数据透传。
> 2026-09-20 (advantage-parity R-D1)：vault.ts 新增 sanitizeVaultFileBaseName / isSafeVaultRelativePath（R-C2 附件名与 R-D1 导出文件名共用边界规则）；index barrel 同步导出。
> 2026-09-18 (R-B3 编辑回退): 新增 `src/shared/editRevertPlan.ts` 归属本 owner —— 编辑回退的纯规划核心（写工具分类、路径/候选提取、保留淘汰规划、侧栏视图模型）。零 Obsidian 依赖，禁止引入 core/feature/app import；单测在 `tests/unit/shared/editRevertPlan.test.ts`。

# Owner: shared.foundation
> 2026-09-21 (advantage-parity R-F3)：editRevertPlan 的纯规划面新增/导出回退预览行数与冲突相关计算契约；继续零 Obsidian 依赖，实际文件读取、blob 保留及写回仍归 core.storage。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `shared` (may import layers: shared)
- **Risk:** low
- **Include:** `src/shared/index.ts`, `src/shared/brandingWordmark.ts`, `src/shared/contextGroupPlan.ts` (R-B2 one-click group-attach planner), `src/shared/editRevertPlan.ts` (R-B3 pure edit-revert planner), `src/shared/batchOrganizePlan.ts` (R-B5 pure batch-organize planner), `src/shared/contextPath.ts`, `src/shared/debugModules.ts`, `src/shared/diagnosticSecretSanitizer.ts`, `src/shared/logger.ts`, `src/shared/obsidianContext.ts`, `src/shared/toolExecution.ts`, `src/shared/toolIdentity.ts`, `src/shared/TooltipLayerController.ts`, `src/shared/vault.ts`

## Responsibilities
- shared cross-cutting primitives: logging, context paths, vault access, tool identity
- diagnostic secret sanitizer primitive
- pure edit-revert planning core (R-B3): write-tool classification, retention planning, sidebar model
- pure batch-organize planning core (R-B5): template scope matching, plan compilation, stale-plan signature

## Canonical state (truth home)
- shared logger instance

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/shared/index.ts`

## Dependency surface
- **Allowed owner dependencies:** _(none declared)_
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.diagnostics`, `shared.modals`

## Focused tests
- `tests/unit/shared/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Vault-relative path pure functions:** `src/shared/vault.ts` gained `toVaultRelativePath()` — cross-platform separator normalization with traversal rejection and directory-boundary stripping that fails closed (`null`) for paths it cannot prove safe — plus `getFilePathBasename()` for unresolved display without parent-directory leakage. `getVaultBasePath()` is unchanged, and the barrel `src/shared/index.ts` re-exports all three.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. shared.foundation retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
- 2026-09-17: `shared/brandingWordmark.ts` 新增 `OPENCODIAN_APP_ICON_ID`（app 标记图标 id 的单一来源，供入口注册与各界面渲染引用），无新增运行时归属。
