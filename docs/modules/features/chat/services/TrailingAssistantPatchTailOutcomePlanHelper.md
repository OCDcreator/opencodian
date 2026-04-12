# TrailingAssistantPatchTailOutcomePlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanHelper` 把 trailing-assistant tail-outcome 的最终顶层 shape 装配从 `ConversationRenderService` 抽成了独立 helper：

- 接收已分别算好的 `tailStatePlan` 与 `completionDebugPlan`
- 统一返回稳定的 `{ tailStatePlan, completionDebugPlan }` contract
- 让 `ConversationRenderService` 只保留 tail-outcome 的 helper 编排，而不再手工展开最终字段

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

- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 现在先分别生成 `tailStatePlan` 与 `completionDebugPlan`，再把最终 shape 装配委托给这里
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责把 execution-tail planning-context 缩成 tail-outcome 专用 contract
- `TrailingAssistantPatchTailStatePlanningContextHelper` 与 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 仍分别负责各自下游 plan 的输入收束
