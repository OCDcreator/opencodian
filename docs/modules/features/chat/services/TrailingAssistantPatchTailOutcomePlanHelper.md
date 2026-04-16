# TrailingAssistantPatchTailOutcomePlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanHelper` 把 trailing-assistant tail-outcome 的最终顶层 shape 装配从 `ConversationRenderService` 抽成了独立 helper：

- 接收已经由 `TrailingAssistantPatchTailOutcomePlanPartsHelper` 收口好的 tail-outcome plan-parts
- 统一返回稳定的 `{ tailStatePlan, completionDebugPlan }` contract
- 让更上游模块把 plan-parts 装配与最终返回值 shape 收口拆成两个单一职责 helper

它不负责 tail-state 计算、不汇总 tail-message summary，也不执行任何 DOM 副作用；只负责最终 tail-outcome plan shape 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export type TrailingAssistantPatchTailOutcomePlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export function buildTrailingAssistantPatchTailOutcomePlans(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlans;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomePlanPartsHelper` 继续先负责把 `{ tailStatePlan, completionDebugPlan }` 收口成局部 plan-parts，再由这里生成最终返回值
- `TrailingAssistantPatchTailOutcomeChildPlansHelper` 现在串联局部 plan-parts helper 与这里的最终 plan helper
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责把 execution-tail planning-context 缩成 tail-outcome 专用 contract
- `TrailingAssistantPatchTailStatePlanningContextHelper` 与 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 仍分别负责各自下游 plan 的输入收束
