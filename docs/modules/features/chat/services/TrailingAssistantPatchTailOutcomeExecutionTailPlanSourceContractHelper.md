# TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper` 负责 trailing-assistant tail-outcome execution-tail 子链里最上游的 source contract 纯装配：

- 接收 execution-tail planning-context 与 `summarizeChatMessageForDebug`
- 先通过 `TrailingAssistantPatchTailOutcomePlanningContextHelper` 收束 tail-outcome 专用 `planningContext`
- 再把消息摘要函数一并注入，返回 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 消费的稳定 source contract

它不生成 `tailStatePlan`、不计算 completion-debug summary，也不执行任何 DOM/runtime 副作用；只负责“execution-tail context + host summarizer → tail-outcome source contract” 这层纯收口。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract(
  parts: TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
): TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract;
```

## 与其他模块的关系

- `ConversationRenderService` 继续只把 host `summarizeChatMessageForDebug()` 回调随 execution-tail planning-context 一起交给 tail-outcome execution helper
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 现在先通过这里收束 source contract，再继续生成 `tailStatePlan` 与 `completionDebugPlan`
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责把 execution-tail contract 缩成 tail-outcome 专用 planning-context
