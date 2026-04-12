# TrailingAssistantPatchSuccessChildPlansHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchSuccessChildPlansHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchSuccessChildPlansHelper` 把 trailing-assistant success 路径里“已预计算的子 plan → 最终 `TrailingAssistantPatchSuccessPlan`”这一层编排从 `ConversationRenderService` 抽成了独立纯 helper：

- 接收已经分别算好的 `executionPlan`、`tailOutcomePlans` 与 `turnBodyScopePlan`
- 先委托 `TrailingAssistantPatchExecutionTailPlanPartsHelper` 收口 `{ executionPlan, tailOutcomePlans }`
- 再委托 `TrailingAssistantPatchSuccessPlanHelper` 生成最终 success-plan 返回值
- 让 `ConversationRenderService` 更接近只保留 success-plan 的控制流与依赖 wiring

它不比较正文签名、不构建 turn-body scope plan，也不执行任何 DOM/runtime 副作用；只负责 child plans 到最终 success-plan 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchSuccessChildPlans =
  TrailingAssistantPatchSuccessPlanParts;

export function buildTrailingAssistantPatchSuccessPlanFromChildPlans(
  childPlans: TrailingAssistantPatchSuccessChildPlans,
): TrailingAssistantPatchSuccessPlan;
```

## 与其他模块的关系

- `ConversationRenderService` 现在把 `TrailingAssistantPatchExecutionTailChildPlansHelper` 返回的 execution-tail plan-parts 与 `turnBodyScopePlan` 交给这里，不再在 service 内手工组装 success-plan parts
- `TrailingAssistantPatchExecutionTailChildPlansHelper` 继续负责把 execution-tail planning-context 与 host ports 编排成 `{ executionPlan, tailOutcomePlans }`
- `TrailingAssistantPatchExecutionTailPlanPartsHelper` 继续只负责 `{ executionPlan, tailOutcomePlans }` 这一层局部 shape
- `TrailingAssistantPatchSuccessPlanHelper` 继续只负责最终 `TrailingAssistantPatchSuccessPlan` 顶层 shape
