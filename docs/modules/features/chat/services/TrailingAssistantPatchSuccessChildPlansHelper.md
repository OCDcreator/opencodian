# TrailingAssistantPatchSuccessChildPlansHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchSuccessChildPlansHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchSuccessChildPlansHelper` 把 trailing-assistant success 路径里“execution/tail child plans + turn-body scope source → 最终 `TrailingAssistantPatchSuccessPlan`”这一层编排从 `ConversationRenderService` 抽成了独立纯 helper：

- 可以接收已经分别算好的 `executionPlan`、`tailOutcomePlans` 与 `turnBodyScopePlan`
- 也可以接收 execution/tail child plans 加上更窄的 `turnBodyScopePlanSource`
- 需要 turn-body scope plan 时，会先委托 `TrailingAssistantPatchTurnBodyScopePlanHelper`
- 先委托 `TrailingAssistantPatchExecutionTailPlanPartsHelper` 收口 `{ executionPlan, tailOutcomePlans }`
- 再委托 `TrailingAssistantPatchSuccessPlanHelper` 生成最终 success-plan 返回值
- 让上层 success-plan 编排更接近只保留 success planning-context 与 host port wiring

它不比较正文签名，也不执行任何 DOM/runtime 副作用；只负责 success child plans 到最终 success-plan 的纯装配，并把 turn-body scope plan 的预计算继续委托给更窄的 helper。

## 公开接口

```typescript
export type TrailingAssistantPatchSuccessChildPlans =
  TrailingAssistantPatchSuccessPlanParts;

export type TrailingAssistantPatchSuccessPlanChildPlanSource =
  Omit<TrailingAssistantPatchSuccessChildPlans, 'turnBodyScopePlan'> & {
    turnBodyScopePlanSource: TrailingAssistantPatchTurnBodyScopePlanSource;
  };

export function buildTrailingAssistantPatchSuccessPlanFromChildPlans(
  childPlans: TrailingAssistantPatchSuccessChildPlans,
): TrailingAssistantPatchSuccessPlan;

export function buildTrailingAssistantPatchSuccessPlanFromChildPlanSource(
  source: TrailingAssistantPatchSuccessPlanChildPlanSource,
): TrailingAssistantPatchSuccessPlan;
```

## 与其他模块的关系

- `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 现在把 `TrailingAssistantPatchExecutionTailChildPlansHelper` 返回的 execution-tail plan-parts 与更窄的 `turnBodyScopePlanSource` 交给这里，不再让 service 直接预建 `turnBodyScopePlan`
- `TrailingAssistantPatchExecutionTailChildPlansHelper` 继续负责把 execution-tail planning-context 与 host ports 编排成 `{ executionPlan, tailOutcomePlans }`
- `TrailingAssistantPatchTurnBodyScopePlanHelper` 继续负责把 `turnBodyScopePlanSource` 预计算成稳定的 `turnBodyScopePlan`
- `TrailingAssistantPatchExecutionTailPlanPartsHelper` 继续只负责 `{ executionPlan, tailOutcomePlans }` 这一层局部 shape
- `TrailingAssistantPatchSuccessPlanHelper` 继续只负责最终 `TrailingAssistantPatchSuccessPlan` 顶层 shape
