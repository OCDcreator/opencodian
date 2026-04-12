# TrailingAssistantPatchSuccessPlanningContextPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchSuccessPlanningContextPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchSuccessPlanningContextPlanHelper` 把 trailing-assistant success 路径里“完整 success planning-context + host ports → 最终 `TrailingAssistantPatchSuccessPlan`”这一层剩余纯编排从 `ConversationRenderService` 抽成独立 helper：

- 接收包含 tail messages、patch target、turn-body parent/runtime 与 sticky-scroll 决策的 success planning-context
- 接收 `getBodySignature()` 与 `summarizeChatMessageForDebug()` 两个 host port，但不直接读取 host
- 先委托 `TrailingAssistantPatchExecutionTailPlanningContextHelper` 收窄 execution-tail planning-context
- 再委托 `TrailingAssistantPatchExecutionTailChildPlansHelper` 生成 execution/tail plan-parts
- 最后把 execution/tail plan-parts 与原始 planning-context 交给 `TrailingAssistantPatchSuccessChildPlansHelper` 生成最终 success-plan

它不执行 DOM/runtime 副作用，也不直接渲染 assistant 内容；只负责把 success planning-context 适配到现有 child-plan helper 链。

## 公开接口

```typescript
export type TrailingAssistantPatchSuccessPlanningContextPlanSource =
  TrailingAssistantPatchExecutionTailPlanningContextSource &
  TrailingAssistantPatchTurnBodyScopePlanSource & {
    getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export function buildTrailingAssistantPatchSuccessPlanFromPlanningContext(
  source: TrailingAssistantPatchSuccessPlanningContextPlanSource,
): TrailingAssistantPatchSuccessPlan;
```

## 与其他模块的关系

- `ConversationRenderService` 现在只负责提供已验证的 success planning-context，并把 host callbacks 注入到这里
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续只负责从较宽的 success context 中挑选 execution/tail 共用字段
- `TrailingAssistantPatchExecutionTailChildPlansHelper` 继续负责正文签名决策、execution-plan 与 tail-outcome plan-parts 的纯编排
- `TrailingAssistantPatchSuccessChildPlansHelper` 继续负责把 execution/tail plan-parts 与 turn-body scope source 装配成最终 success-plan
