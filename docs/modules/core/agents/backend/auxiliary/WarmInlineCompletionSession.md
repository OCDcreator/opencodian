# WarmInlineCompletionSession

> **源码**: `src/core/agents/backend/auxiliary/WarmInlineCompletionSession.ts`
> **状态**: [REVIEW]

## 概述

R-C3「热会话、冷语义」的共享生命周期包装：每个后端 adapter 用自己**既有的、已审计的** `AuxQuerySession` 构造（OpenCode 隔离 scope / Claude tools 白名单+`system/init` 读回 / Codex 只读沙箱 / Pi `set_tools` 读回），本类只补 aux 契约没有的三件事——回合串行化、`reset()`（经 adapter 自带只读工厂重建）、统一补全回合 prompt。四后端一份实现，零机制复制。

## 职责

- `complete()`：把 `InlineCompletionTurnRequest` 经 `buildInlineCompletionTurnPrompt` 变成一次 aux `query()`；内部按 promise tail 串行化（被取消的回合很快 settle，取消后重触发不阻塞）
- `reset()`：等 tail → 经 `recreate()` 工厂重建 → `warmUp()` → dispose 旧会话；笔记/模型切换时由池触发
- `dispose()`：幂等；先把 `current` 换成 disposed 占位（防并发回合拿到半死会话），再等 tail、释放原生状态
- `warmUp()`（可选 seam）：create 与 reset 后调用，Claude 据此提前拉起 CLI 进程
- `safety` 原样透传 aux 会话的运行时只读证明；observed tool calls 原样上抛供 `findWriteToolCalls` 审计

## 依赖

- `../AgentInlineCompletionCapability`、`../AgentAuxQueryCapability`、`../../../types/chat`

## 维护约束

- 本类**不得**接触任何后端选项——只读机制全部留在各 aux 会话与 adapter 构造里，这里没有放宽的入口
- `recreate()` 必须等价于初始构造（同 systemPrompt/model/目录），否则 reset 后的会话与池登记的模型不一致
- 包装层引入的任何新行为都要同时满足四后端；后端差异只允许出现在 adapter 的工厂闭包里
