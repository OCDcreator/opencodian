# Owner: core.runtime

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-17 (shadcn style): `saveChatAppearanceImmediately()` 成功后补调 `refreshOpenCodianViews({reloadModels:false, applyUi:true})`，修复预设切换不立即生效（此前需等下一次全量设置保存才推 UI）。边界与依赖不变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high
- **Include:** `src/core/runtime/**`

## Responsibilities
- startup bootstrap coordination and performance tracing
- settings runtime coordination (theme/appearance composition and persistence)

## Canonical state (truth home)
- startup performance trace
- settings runtime coordinator state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/runtime/OpenCodianStartupCoordinator.ts`
- `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`, `core.config`, `core.opencode`, `core.storage`, `core.theme`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `app.runtime`, `feature.chat-shell`

## Focused tests
- `tests/unit/core/runtime/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.runtime retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。
