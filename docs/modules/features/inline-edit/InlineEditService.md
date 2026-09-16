# InlineEditService

> **源码**: `src/features/inline-edit/InlineEditService.ts`
> **状态**: [REVIEW]

## 概述

backend 无关的 inline edit 编排：一个 inline edit 一个 `AuxQuerySession`，负责请求构建、解析、澄清循环、写类工具审计与脏检查判定；不碰编辑器。

## 职责

- `ensureSession()`：解析能力与模型后调用 `startAuxQuerySession()`。无 `AuxQuery` 能力、模型不可用、或后端拒绝建立只读会话时返回 `error`，**不降级**
- `submit()`：先构建请求（构建失败直接返回原因，不启动会话），再执行首轮
- `clarify()`：走 `session.followUp()`，复用后端原生会话状态（设计 §7.6 要求）
- `runTurn()`：统一处理回合结果
  - 失败/取消 → 相应 error；回合失败视为会话不可复用并 dispose
  - `findWriteToolCalls()` 命中任何写类工具 → 丢弃结果、dispose 会话、报 `write-tool-observed`（§5.5 rule 2）
  - 解析响应 → `preview` / `clarification` / `error`
- `cancel()` 取消当前回合但保留会话；`dispose()` 幂等释放原生会话
- `canApplyEdit(snapshot, currentText)`：脏检查谓词（全等比对，含行尾敏感）

## 依赖

- `../../core/agents/backend/AgentAuxQueryCapability`：能力接口与 `findWriteToolCalls`
- `./InlineEditPrompt`、`./InlineEditTypes`

## 维护约束

- 每个退出路径都要释放会话；inline edit 关闭时不允许留下原生 session/thread/进程
- 写类工具审计是安全门禁，不允许改成"记录但不丢弃"
- 澄清轮必须走 `followUp()` 而不是新建会话，否则会丢失后端的原生上下文
- 该服务不写编辑器：接受落盘由 `InlineEditController` 用单次 `replaceRange` 完成
