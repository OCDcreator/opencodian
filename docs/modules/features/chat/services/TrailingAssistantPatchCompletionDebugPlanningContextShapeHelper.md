# TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug planning-context 的最后一层 `{ shouldStickToBottom, summaryPlan }` shape 装配从 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 抽成了独立 pure helper：

- 接收已经准备好的 `shouldStickToBottom` 与 `summaryPlan`
- 统一返回稳定的 completion-debug planning-context contract
- 让上游 planning-context helper 更接近只负责编排 summary-plan、inputs 与 final shape

它不读取 tail messages、不计算 tail-message summary，也不生成最终 `completionDebugPlan`；只负责最终 planning-context shape 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs = {
  shouldStickToBottom: boolean;
  summaryPlan: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
};

export type TrailingAssistantPatchCompletionDebugPlanningContext =
  TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs;

export function buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
  inputs: TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
): TrailingAssistantPatchCompletionDebugPlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 现在把最终 planning-context shape 的装配委托给这里，自己只负责编排 summary-plan 与 inputs helper
- `TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper` 负责把 `tailStatePlan.shouldStickToBottom` 与 `summaryPlan` 预先收束成这里消费的 inputs
- `TrailingAssistantPatchCompletionDebugSummaryPlanHelper` 继续负责更早一步的 `summaryPlan` 纯装配
- `TrailingAssistantPatchCompletionDebugPlanHelper` 继续消费这里返回的稳定 completion-debug planning-context，并展开最终 debug plan
