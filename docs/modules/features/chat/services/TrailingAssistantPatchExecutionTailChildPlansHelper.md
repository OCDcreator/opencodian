# TrailingAssistantPatchExecutionTailChildPlansHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchExecutionTailChildPlansHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchExecutionTailChildPlansHelper` 把 trailing-assistant success-plan 里“execution-tail planning-context + host ports → `{ executionPlan, tailOutcomePlans }`”的纯编排收口成独立 helper：

- 接收已经收束好的 execution-tail planning-context
- 接收 `getBodySignature()` 与 `summarizeChatMessageForDebug()` 两个 host port，但不直接读取 host 其他依赖
- 先委托 `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 生成 `shouldFinalizeFooterOnly`
- 再串联 `TrailingAssistantPatchExecutionTailExecutionPlanHelper` 与 `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper`
- 最后复用 `TrailingAssistantPatchExecutionTailPlanPartsHelper` 返回稳定的 execution-tail plan-parts contract

它不构建 `turnBodyScopePlan`、不直接生成最终 `TrailingAssistantPatchSuccessPlan`，也不执行 DOM/runtime 副作用；只负责 execution/tail child plans 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionTailChildPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailChildPlanSource,
): TrailingAssistantPatchExecutionTailPlanParts;
```

## 与其他模块的关系

- `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 会把收窄后的 execution-tail planning-context 与两个 host port 注入到这里，再单独协调 `turnBodyScopePlan`
- `TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 继续只负责正文签名 source-contract 与布尔决策子链
- `TrailingAssistantPatchExecutionTailExecutionPlanHelper` 继续只负责 `shouldFinalizeFooterOnly + planningContext → executionPlan`
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 继续只负责 `planningContext + summarizeChatMessageForDebug → tailOutcomePlans`
- `TrailingAssistantPatchExecutionTailPlanPartsHelper` 继续只负责 `{ executionPlan, tailOutcomePlans }` 的局部 shape 收口
- `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 会把这里返回的 execution-tail plan-parts 继续交给 `TrailingAssistantPatchSuccessChildPlansHelper`，并与 `turnBodyScopePlan` 合成为最终 success-plan
