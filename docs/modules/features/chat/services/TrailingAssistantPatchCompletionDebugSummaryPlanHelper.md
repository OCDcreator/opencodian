# TrailingAssistantPatchCompletionDebugSummaryPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugSummaryPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugSummaryPlanHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug `summaryPlan` 的纯装配从 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 抽成了独立 helper：

- 接收 `previousTailMessage`、`nextTailMessage` 与消息摘要函数
- 统一产出稳定的 `summaryPlan.previousTail / nextTail`
- 让上游 planning-context helper 更接近只负责编排 summary 子结果、inputs helper 与 final shape

它不读取 `tailStatePlan`、不生成最终 completion-debug planning-context，也不处理 debug 日志；只负责 tail-message summary 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugSummaryPlanSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  summarizeChatMessageForDebug(
    message: ChatMessage | null | undefined,
  ): Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugSummaryPlan = {
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export function buildTrailingAssistantPatchCompletionDebugSummaryPlan(
  source: TrailingAssistantPatchCompletionDebugSummaryPlanSource,
): TrailingAssistantPatchCompletionDebugSummaryPlan;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 现在委托这里生成 `summaryPlan`，再交给 `TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper` 组合 `shouldStickToBottom`
- `TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper` 继续消费这里返回的 `summaryPlan` 并生成 final shape inputs
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 继续负责更上游的 source contract 装配
- `TrailingAssistantPatchCompletionDebugPlanHelper` 继续消费包含 `summaryPlan` 的窄 completion-debug planning-context
