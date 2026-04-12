# TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug planning-context 的 shape inputs 装配从 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 抽成了独立 pure helper：

- 接收已经算好的 `summaryPlan`
- 从 `tailStatePlan.shouldStickToBottom` 读取最终 stick-to-bottom 信号
- 统一返回 `TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper` 消费的 `{ shouldStickToBottom, summaryPlan }` inputs

它不读取 tail messages、不调用消息摘要函数，也不生成最终 planning-context shape；只负责 summary 子结果与 tail-state 信号到 shape inputs 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlanningContextInputsParts = {
  tailStatePlan: {
    shouldStickToBottom: boolean;
  };
  summaryPlan: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
};

export function buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextInputsParts,
): TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 现在先委托 `TrailingAssistantPatchCompletionDebugSummaryPlanHelper` 生成 `summaryPlan`，再通过这里生成 shape inputs
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 继续定义 `tailStatePlan` 的稳定 source contract
- `TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper` 继续消费这里返回的 inputs，并装配最终 planning-context shape
