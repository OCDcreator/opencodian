# TrailingAssistantPatchExecutionTailPlanPartsHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchExecutionTailPlanPartsHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchExecutionTailPlanPartsHelper` 把 trailing-assistant success-plan 里 execution/tail 这一层 `{ executionPlan, tailOutcomePlans }` 局部 shape 装配从更高层 child-plans orchestration 中抽成了独立纯 helper：

- 接收已分别算好的 `executionPlan` 与 `tailOutcomePlans`
- 统一返回稳定的 execution-tail plan-parts contract
- 让 `ConversationRenderService` 在 success-plan parts 阶段更接近只负责把 turn-body scope 与既成 execution/tail 子计划拼接到一起

它不比较正文签名、不构建 tail-outcome plans，也不执行任何 DOM/runtime 副作用；只负责 execution/tail 层 plan-parts 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionTailPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
};

export function buildTrailingAssistantPatchExecutionTailPlanParts(
  planParts: TrailingAssistantPatchExecutionTailPlanParts,
): TrailingAssistantPatchExecutionTailPlanParts;
```

## 与其他模块的关系

- `TrailingAssistantPatchSuccessChildPlansHelper` 现在会消费这里返回的 execution/tail plan-parts，并继续交给 `TrailingAssistantPatchSuccessPlanHelper`
- `TrailingAssistantPatchExecutionPlanHelper` 继续只负责 finalize-footer / rerender-content 两种 execution-plan shape
- `TrailingAssistantPatchTailOutcomePlanHelper` 继续只负责 `{ tailStatePlan, completionDebugPlan }` 这一层 tail-outcome shape
- `ConversationRenderService` 现在会先基于 execution-tail planning-context 分别预建 `executionPlan` 与 `tailOutcomePlans`，再把这些 child plans 交给 `TrailingAssistantPatchSuccessChildPlansHelper`，由后者复用这里完成局部 shape 收口
