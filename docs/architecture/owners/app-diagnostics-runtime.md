# app.diagnostics-runtime
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

> **Layer:** app
> **Risk:** high
> **Required gates:** diagnostics-safety, typecheck, module-docs

## Responsibility

集中构造三个后端 trace service（OpenCode、Codex、Claude），暴露 typed backend ports，并统一 flush/dispose 生命周期。`main.ts` 只构造一个 `DiagnosticsRuntimeCoordinator`，不再直接 `new *SessionTraceService`。

## Canonical state

- `DiagnosticsRuntimeCoordinator` 实例（拥有三个 trace service 实例）。

## Entrypoints

- `DiagnosticsRuntimeCoordinator`（构造 + typed ports + dispose）

## Allowed owner dependencies

- `shared.foundation`
- `shared.diagnostics`
- `core.opencode-diagnostics`
- `core.backend-diagnostics`

## Forbidden dependencies

- `feature.chat-shell`、`feature.settings-shell`、`feature.chat-diagnostics`（诊断运行时不得依赖 chat/settings 消费者；消费者通过 typed ports 反向消费）。

## Adjacent owners

- `feature.chat-diagnostics`、`feature.settings-debug`、`app.composition`

## Invariants

- 构造顺序固定 OpenCode → Codex → Claude；dispose 同序，`dispose()` 顺序 await 每个后端的 `.dispose().catch(...)`（fail-closed，确定性 teardown），main.ts onunload 以 `void` 调用。
- 暴露 typed backend ports（`openCode`/`codex`/`claude`），不暴露泛型可变 service map。
- 不合并三后端事件 schema 或内部状态。
- 每后端 option getter 保持原有构造时序不对称（OpenCode 静态 knownSecrets 快照 vs Claude/Codex 动态 getter）。

## Tests

- `tests/unit/app/diagnostics/**`

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. app.diagnostics-runtime retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。
