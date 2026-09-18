# AgentInlineCompletionCapability

> **源码**: `src/core/agents/backend/AgentInlineCompletionCapability.ts`
> **状态**: [REVIEW]

## 概述

R-C3 Alt 一键补全的后端中立契约：在**长驻/预热**的只读会话上跑「每回合无状态」的补全请求。与 `AgentAuxQueryCapability` 是平行接口——aux 的「每次编辑新建、退出即 dispose」契约一字不改；本通道只复用各后端已审计的只读机制（`docs/requirements/flowtext-c3-design.md` §3.2）。

## 职责

- `InlineCompletionTurnRequest`：`prefix`（≤4000 字符、整行对齐）+ `suffix`（≤1000）+ `maxChars` + `signal` + `onTextChunk`（渐进首字节）
- `InlineCompletionSession`：`complete()` / `reset()`（丢弃原生上下文，笔记或模型切换时必须调用）/ `dispose()`；`safety` 与 aux 完全同构（`AuxQuerySafetyProof` 原样复用，读回验证失败即 start 拒绝）
- `AgentInlineCompletionCapability`：可选能力——后端不满足即不实现（如实不可用，§6.5）
- 共享常量：`INLINE_COMPLETION_PREFIX_WINDOW_CHARS=4000`、`INLINE_COMPLETION_SUFFIX_WINDOW_CHARS=1000`、`INLINE_COMPLETION_TURN_TIMEOUT_MS=4000`（800ms 是首字节**预算**，按后端实测如实记录，不作为 abort 阈值——C3-Q5「保持可用、如实标注」）
- `buildInlineCompletionTurnPrompt()`：统一的用户回合消息（前文 + `<^.^>` 光标标记 + 后文），四后端 wire 格式一致

## 依赖

- `./AgentService`（能力基座）、`./AgentAuxQueryCapability`（SafetyProof/工具观察/模型选择复用）

## 维护约束

- **不得**给本通道新增任何写能力；每回合 observed tool calls 必须交给 feature 层的 `findWriteToolCalls` 审计（期望零写工具）
- 回合语义完全由请求承载，**不得依赖**服务端会话记忆；`reset()` 是笔记/模型切换的硬性要求
- 800ms 达不到的后端在审计中如实标注实测值，不粉饰、不静默放宽
