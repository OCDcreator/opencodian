# InlineEditService

> **源码**: `src/features/inline-edit/InlineEditService.ts`
> **状态**: [REVIEW]

## 概述

backend 无关的 inline edit 编排：一个 inline edit 一个 `AuxQuerySession`，负责请求构建、解析、澄清循环、写类工具审计与脏检查判定；不碰编辑器。

## 职责

- `ensureSession()`：解析能力与模型后调用 `startAuxQuerySession()`。所有等待者共享同一个启动与接入检查；启动期间服务关闭或被取消时，迟到的原生会话先释放，再返回 `cancelled`，不得接入或查询。无 `AuxQuery` 能力、模型不可用、或后端拒绝建立只读会话时返回 `error`，**不降级**
- `submit(request, options?)`：先构建请求（构建失败直接返回原因，不启动会话），再执行首轮。`InlineEditTurnOptions`（R-A3/R-A4）：`onTextChunk` 透传 backend 流式接缝给调用方做渐进渲染；`images`（`AuxQueryImageAttachment[]`）仅首轮携带，澄清轮复用已见图的会话。带图时于 prompt 末尾追加 `buildInlineEditImageNote(locale, request)`（图片语义 + 按锚点形态选择 LaTeX 定界符），`images` 原样透传——绝不静默降级为无图请求
- `clarify(instruction, options?)`：走 `session.followUp()`，复用后端原生会话状态（设计 §7.6 要求）；`options.onTextChunk` 让澄清回复同样流式显示
- `clarify()`：走 `session.followUp()`，复用后端原生会话状态（设计 §7.6 要求）
- `runTurn()`：统一处理回合结果
  - 失败/取消 → 相应 error；回合失败视为会话不可复用并 dispose
  - `findWriteToolCalls()` 命中任何写类工具 → 丢弃结果、dispose 会话、报 `write-tool-observed`（§5.5 rule 2）
  - 解析响应 → `preview` / `clarification` / `error`
- `cancel()` 取消当前回合；已建立的会话保留供重试/澄清，尚在启动的会话失效并在返回后释放，之后可以重新提交
- `dispose()` 立即关闭服务并脱离当前会话；共享一次释放 Promise，重复调用也等待同一原生释放。尚在启动时必须等待工厂返回及迟到会话的释放，不允许关闭后重启或发起 query/followUp
- `submit()` 在等待会话接入后再次核对关闭/取消状态，避免等待交接期间发生取消后仍发起查询
- `canApplyEdit(snapshot, currentText)`：脏检查谓词（全等比对，含行尾敏感）
- `describeInlineEditOutcome(reason, detail)`：把回合失败原因（含协议/校验原因，经 `describeInlineEditFailure`）翻成用户可见文案（controller 错误态用）

## 依赖

- `../../core/agents/backend/AgentAuxQueryCapability`：能力接口与 `findWriteToolCalls`
- `./InlineEditPrompt`、`./InlineEditTypes`

## 维护约束

- 每个退出路径都要释放会话；inline edit 关闭时不允许留下原生 session/thread/进程，包括关闭时仍未完成的会话工厂。旧服务的迟到释放不得改变其它编辑器的新服务会话
- 写类工具审计是安全门禁，不允许改成"记录但不丢弃"
- 澄清轮必须走 `followUp()` 而不是新建会话，否则会丢失后端的原生上下文
- 该服务不写编辑器：接受落盘由 `InlineEditController` 用单次 `replaceRange` 完成
