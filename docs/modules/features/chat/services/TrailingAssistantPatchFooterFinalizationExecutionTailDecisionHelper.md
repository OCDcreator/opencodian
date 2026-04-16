# TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper` 把 trailing-assistant success-plan 里“execution-tail planning-context + host body-signature getter → shouldFinalizeFooterOnly”的纯编排从 `ConversationRenderService` 抽成了独立 helper：

- 接收已经收束好的 execution-tail planning-context
- 接收 `getBodySignature()` getter，但不直接读取 host 其他依赖
- 先委托 `TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper` 读取前后正文签名 source contract
- 再复用 `TrailingAssistantPatchFooterFinalizationDecisionHelper` 返回最终 `shouldFinalizeFooterOnly` 布尔结论

它不生成 execution plan、不执行 DOM 副作用，也不关心 tail child-plan 装配；只负责 footer-finalization 决策子链的纯 helper 编排。

## 公开接口

```typescript
export type TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource =
  TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts;

export function shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource,
): boolean;
```

## 与其他模块的关系

- `TrailingAssistantPatchExecutionTailChildPlansHelper` 现在只把 execution-tail planning-context 与 `getBodySignature()` 注入到这里，不再让更高层直接串联 source-contract helper 与布尔决策 helper
- `TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper` 继续负责 execution-tail context 到前后正文签名 source contract 的纯读取
- `TrailingAssistantPatchFooterFinalizationDecisionHelper` 继续只负责比较前后正文签名并返回布尔决策
- `TrailingAssistantPatchExecutionTailChildPlansHelper` 会继续消费这里产出的 `shouldFinalizeFooterOnly`，并把它连同 execution-tail planning-context 交给 `TrailingAssistantPatchExecutionTailExecutionPlanHelper`
