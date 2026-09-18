# Owner: feature.chat-diagnostics

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts`, `src/features/chat/services/CodexDiagnosticsHostAdapter.ts`, `src/features/chat/services/ChatDiagnosticsCoordinator.ts`

## Responsibilities
- chat-side OpenCode, Codex, and Claude diagnostics state, menu routes, capture-token operations, and report/export callbacks
- `ChatDiagnosticsCoordinator` composition of the OpenCode port with Codex and Claude host adapters
- trace failure containment away from chat path

## Canonical state (truth home)
- chat diagnostics coordinator and host adapter state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/chat/services/ClaudeDiagnosticsHostAdapter.ts`
- `src/features/chat/services/CodexDiagnosticsHostAdapter.ts`
- `src/features/chat/services/ChatDiagnosticsCoordinator.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.backend-diagnostics`, `core.opencode-diagnostics`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `core.backend-diagnostics`, `feature.settings-debug`

## Focused tests
- `tests/unit/features/chat/ChatDiagnosticsCoordinator.test.ts`
- `tests/unit/features/chat/ChatDiagnosticsContract.test.ts`
- `tests/unit/features/chat/*DiagnosticsHostAdapter.test.ts`
- `tests/unit/features/chat/CodexDiagnosticsHost.test.ts`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run diagnostics-safety`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-diagnostics retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。
