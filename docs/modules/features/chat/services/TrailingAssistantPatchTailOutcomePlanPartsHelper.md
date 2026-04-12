# TrailingAssistantPatchTailOutcomePlanPartsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanPartsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanPartsHelper` 把 trailing-assistant tail-outcome 路径里 `{ tailStatePlan, completionDebugPlan }` 这一层局部 shape 装配从更上游的 execution-tail helper 中抽成了独立纯 helper：

- 接收已分别算好的 `tailStatePlan` 与 `completionDebugPlan`
- 统一返回稳定的 tail-outcome plan-parts contract
- 让 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 更接近只负责 orchestrate tail-state / completion-debug 两条子计划

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

- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 现在会先分别预建 `tailStatePlan` 与 `completionDebugPlan`，再把这一层局部 shape 收口委托给这里
- `TrailingAssistantPatchTailOutcomePlanHelper` 继续只负责把既成的 tail-outcome plan-parts 变成最终 `tailOutcomePlans` 返回值
- `TrailingAssistantPatchTailStateTailOutcomePlanHelper` 与 `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 仍分别负责各自子计划的纯编排
