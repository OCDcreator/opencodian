# TrailingAssistantPatchTailOutcomePlanPartsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanPartsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanPartsHelper` 把 trailing-assistant tail-outcome 路径里 `{ tailStatePlan, completionDebugPlan }` 这一层局部 shape 装配从更上游的 execution-tail helper 中抽成了独立纯 helper：

- 接收已分别算好的 `tailStatePlan` 与 `completionDebugPlan`
- 统一返回稳定的 tail-outcome plan-parts contract
- 让更上游模块把 child-plan 结果装配与最终 plan shape 收口保持分层

它不收窄 planning-context、不计算 tail-message summary，也不执行任何 DOM/runtime 副作用；只负责 tail-outcome plan-parts 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export function buildTrailingAssistantPatchTailOutcomePlanParts(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlanParts;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomeChildPlansHelper` 现在会消费这里返回的局部 plan-parts，并继续交给 `TrailingAssistantPatchTailOutcomePlanHelper`
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 继续只负责预建 `tailStatePlan` 与 `completionDebugPlan` 两条子计划，再把顶层结果装配交给更窄 helper
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 与 `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 仍分别负责各自子计划的纯编排
