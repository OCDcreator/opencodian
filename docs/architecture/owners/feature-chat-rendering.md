# Owner: feature.chat-rendering
> 2026-09-21 (advantage-parity R-E4)：已发消息附件徽标按检索通道标注。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
> 2026-09-21 (advantage-parity R-E1)：UserMessageContentRenderer 的 url 附件 chip 带「抓取失败」徽标并外链打开。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-17 (chat frame inset): chatAppearance 新增 `--opencodian-chat-inset-x` 与 `--opencodian-composer-{inset-x,inset-y,max-height}` 变量输出；view-content 横向内边距清零、由容器 padding-inline 承担。本 owner 边界不变，仅变量面扩大。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/chat/rendering/autoScrollState.ts`, `src/features/chat/rendering/chatAppearance.ts`, `src/features/chat/rendering/composerContext.ts`, `src/features/chat/rendering/forkMessages.ts`, `src/features/chat/rendering/renderGroups.ts`, `src/features/chat/rendering/**`, `src/features/chat/rendering/userMessageActions.ts`, `src/features/chat/rendering/userMessageDisplay.ts`

## Responsibilities
- message render grouping, appearance, auto-scroll, collapsible sections
- user message actions/display and composer context state

## Canonical state (truth home)
- chat composer context state
- chat appearance settings snapshot

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/rendering/composerContext.ts`
- `src/features/chat/rendering/renderGroups.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-runtime`

## Focused tests
- `tests/unit/features/chat/rendering/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Collapsible disposal:** `setupCollapsible` returns an idempotent dispose handle that disconnects its ResizeObserver and removes toggle listeners; wrappers register in a module-level WeakMap so `disposeCollapsiblesWithin(rootEl)` can release every collapsible before a message subtree is cleared or replaced (undisposed observers are a potential retention risk).
- **Expansion-state boundary:** persisted block expansion state belongs to `AssistantShellViewHostAdapter` in `feature.chat-runtime`; this rendering owner continues to provide disposal primitives only and must not become a second state store.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-rendering retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.chat-rendering` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/features/chat/rendering`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。
