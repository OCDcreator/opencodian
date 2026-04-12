# TrailingAssistantPatchExecutionTailExecutionPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchExecutionTailExecutionPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchExecutionTailExecutionPlanHelper` 把 trailing-assistant success-plan 里“execution-tail planning-context + finalize-footer 决策 → executionPlan”的纯编排从 `ConversationRenderService` 抽成了独立 helper：

- 接收已经收束好的 execution-tail planning-context
- 接收已经由 `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 预先算好的 `shouldFinalizeFooterOnly` 决策
- 复用 `TrailingAssistantPatchExecutionPlanHelper` 统一返回稳定的 `finalize-footer` / `rerender-content` execution-plan contract

它不自行比较正文签名、不读取 host，也不执行 DOM 副作用；只负责 execution-tail context 到最终 execution plan 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionTailExecutionPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  shouldFinalizeFooterOnly: boolean;
};

export function buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan;
```

## 与其他模块的关系

- `ConversationRenderService` 现在只保留 host getter wiring，并通过 `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 得到 `shouldFinalizeFooterOnly`，再把窄的 execution-tail planning-context 交给这里
- `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 负责把 execution-tail planning-context 与 host getter 串联成最终的布尔决策
- `TrailingAssistantPatchFooterFinalizationDecisionHelper` 负责 previous / next body signature 的纯相等性判断
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续负责从更宽的 success `planningContext` 收束这里消费的共享 contract
- `TrailingAssistantPatchExecutionPlanHelper` 继续只负责最底层的 `finalize-footer` / `rerender-content` shape 装配
- `TrailingAssistantPatchExecutionTailPlanPartsHelper` 继续消费这里返回的 `executionPlan`，并与 `tailOutcomePlans` 合成为 execution-tail plan-parts
