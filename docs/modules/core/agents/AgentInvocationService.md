# AgentInvocationService

> **源码**: `src/core/agents/AgentInvocationService.ts`
> **状态**: [REVIEW]

## 概述

`AgentInvocationService` 把聊天侧的显式代理调用意图翻译成 OpenCode 原生 prompt 结构：

- top-level `agent`
- `agent` request part（`@subagent`）
- `subtask` request part

它不负责 transport、UI picker，也不做静默 fallback；没有显式意图时返回空解析结果，让普通 prompt 行为保持不变。

## 公开接口

```ts
export class AgentInvocationService {
  resolveInvocationIntent(intent: SurfaceInvocationIntent | undefined): ResolvedAgentInvocation;
  removeMentionFallbackText(content: string, invocation: ResolvedAgentInvocation): string;
}
```

## 行为

- 仅在 `kind` 为空或为 `'prompt'` 时产出结果
- `primaryAgent` 会先 trim，再映射到 top-level `agent`
- `mentions[]` 会映射成原生 `agent` request parts，并保留可选 source span
- `removeMentionFallbackText()` 会从 transport text 中剔除 selected mention 的 source span，避免同一个 `@agent` 同时作为普通文本和 native `agent` part 发送；source span 不匹配当前内容时保持原文不变
- `subtasks[]` 会映射成原生 `subtask` request parts，并保留可选 model / command
- 空白或不完整的 mention/subtask 会被丢弃，避免生成无效 native parts

## 边界

- 不负责判定 runtime 是否最终接受该 agent/subtask
- 不负责 stable part id；这仍由 `OpenCodePromptRequestBuilder` 生成
- 不负责 chat submission / send pipeline wiring；这些由 `MessageSendPreparationService` 与 `SendPipelineRuntime` 接手
