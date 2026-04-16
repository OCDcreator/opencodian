# TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper` 负责把 trailing-assistant success-path 入口最后剩下的 host callback 适配，从 `ConversationRenderService` 收束成稳定的 source contract：

- 接收已经过 preflight 校验的 success `planningContext`
- 接收只暴露 `getBodySignature()` 的窄 `assistantTailRender` body-signature port
- 接收 `summarizeChatMessageForDebug()` debug summarizer
- 返回 `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 消费的稳定 source contract

它不生成 execution/tail child-plans、不收窄 execution-tail planning-context，也不执行 DOM/runtime 副作用；只负责“success planning-context + host ports → success-plan source contract”这一层纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchSuccessPlanningContextPlanBaseSource =
  TrailingAssistantPatchExecutionTailPlanningContextSource &
  TrailingAssistantPatchTurnBodyScopePlanSource;

export type TrailingAssistantPatchSuccessPlanningContextPlanSource =
  TrailingAssistantPatchSuccessPlanningContextPlanBaseSource & {
    getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export type TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchSuccessPlanningContextPlanBaseSource;
  assistantTailRender: TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract(
  parts: TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts,
): TrailingAssistantPatchSuccessPlanningContextPlanSource;
```

## 与其他模块的关系

- `ConversationRenderService` 现在先通过这里把 host adapter wiring 收束成稳定 source contract，再交给 `TrailingAssistantPatchSuccessPlanningContextPlanHelper`
- `TrailingAssistantPatchSuccessPlanningContextPlanHelper` 继续只负责 success planning-context 到最终 success-plan 的纯编排
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 与 `TrailingAssistantPatchSuccessChildPlansHelper` 继续消费这里产出的稳定 source contract
