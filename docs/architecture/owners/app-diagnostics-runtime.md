# app.diagnostics-runtime
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

2026-11-10（第四后端 port `dsh`——DSH wire trace 实施机制已冻结，独立复核/宿主验收待完成）：coordinator 追加构造并持有 `DshSessionTraceService`：构造顺序钉在 OpenCode → Codex → Claude 之后的最后一位，fail-closed（settings getter 未开启任一 transport 门时 store 为 disabled；`dshSettings` 未提供时使用全关缺省 getter）；`ports` 增加 typed property `dsh`（仍无泛型 service map），`dispose()` 以 OpenCode → Codex → Claude → DSH 顺序逐个 await（fail-closed warn，不阻塞 unload）；部分构造失败时对已构造服务 best-effort dispose。事件边界：会话绑定与回合生命周期只从 wire 记录推导，事件仅 metadata/lifecycle/timing——严格字段白名单、无 raw prompt/credential/config、无 content capture、stderr 不采集，事件带 `source@generation` 身份、时长一律 client-observed，不表述为官方执行时长。observer 注入边界：本 owner 只构造、持有并以 typed port 暴露该 service；wire observer 由组合层（main.ts）经 `AgentAdapterWiring` 的 `dshTracePort` 注入 adapter 的 client 工厂，本 owner 不直接接触 DSH adapter/client，也不依赖 chat/settings 消费者；settings/knownSecrets/runtimeMetadata getter 由组合层惰性提供，本 owner 不解析凭据、不合并第四后端的事件 schema 或内部状态。

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

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `app.diagnostics-runtime` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 目录定位（2026-10-23）

当前源码目录：`src/app/diagnostics`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。

2026-10-28 owner manifest 核对：仅 app.memory-runtime 的模型调用依赖由 core.opencode 改为 core.backend 通用只读辅助能力；本 owner `app.diagnostics-runtime` 的 include、职责、canonical state 与依赖规则逐项对比 HEAD 均未改变。
