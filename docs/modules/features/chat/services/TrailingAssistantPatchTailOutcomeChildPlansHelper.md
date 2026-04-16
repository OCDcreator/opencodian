# TrailingAssistantPatchTailOutcomeChildPlansHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomeChildPlansHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomeChildPlansHelper` 把 trailing-assistant tail-outcome 路径里“已预计算的子 plan → 最终 `tailOutcomePlans`”这一层结果装配从 execution-tail helper 中抽成了独立纯 helper：

- 接收已经分别算好的 `tailStatePlan` 与 `completionDebugPlan`
- 先委托 `TrailingAssistantPatchTailOutcomePlanPartsHelper` 收口局部 plan-parts
- 再委托 `TrailingAssistantPatchTailOutcomePlanHelper` 生成最终 `{ tailStatePlan, completionDebugPlan }` 返回值
- 让 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 更接近只负责 orchestrate 子计划

它不收窄 planning-context、不计算 tail-message summary，也不执行任何 DOM/runtime 副作用；只负责 child plans 到最终 tail-outcome result 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomeChildPlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export function buildTrailingAssistantPatchTailOutcomePlansFromChildPlans(
  childPlans: TrailingAssistantPatchTailOutcomeChildPlans,
): TrailingAssistantPatchTailOutcomePlans;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 现在把已算好的两个子 plan 交给这里，不再直接串联 plan-parts helper 与最终 plan helper
- `TrailingAssistantPatchTailOutcomePlanPartsHelper` 继续只负责 `{ tailStatePlan, completionDebugPlan }` 的局部 plan-parts shape
- `TrailingAssistantPatchTailOutcomePlanHelper` 继续只负责最终 `tailOutcomePlans` 顶层 shape 收口
