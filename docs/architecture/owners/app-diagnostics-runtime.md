# app.diagnostics-runtime

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
