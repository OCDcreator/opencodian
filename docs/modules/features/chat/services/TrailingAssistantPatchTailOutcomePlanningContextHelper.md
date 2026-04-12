# TrailingAssistantPatchTailOutcomePlanningContextHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchTailOutcomePlanningContextHelper` 把 trailing-assistant success-plan 里 tail-outcome planning-context 的纯装配从 `ConversationRenderService` 抽成了独立 helper：

- 接收 execution-tail planning-context 风格的 source：tail messages、`patchTarget` 与 `shouldStickToBottom`
- 把 source 到 tail-outcome shape inputs 的装配委托给 `TrailingAssistantPatchTailOutcomePlanningContextInputsHelper`
- 自身只继续编排 `source -> inputs -> final shape`
- 保持 `tailStatePlan` / `completionDebugPlan` 下游继续消费同一份稳定的 tail-outcome contract

它不负责正文 patch 决策、不生成 tail-state 或 completion debug plan，也不执行任何 DOM 副作用；只负责 tail-outcome planning-context 的纯输入收口。

## 公开接口

```typescript
export type TrailingAssistantPatchTailOutcomePlanningContextSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: {
    messageEl: HTMLElement;
  };
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomePlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchTailOutcomePlanningContextInputsHelper` 负责把 `patchTarget.messageEl` 与 tail messages 收束成这里消费的 shape inputs
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper` 现在先把 execution-tail planning-context 交给这里，再把收束后的 tail-outcome context 与 debug summarizer 一起继续传给更下游的 execution-tail plan helper
- `TrailingAssistantPatchExecutionTailPlanningContextHelper` 继续负责从 success planning-context 收窄出 execution/tail 共用字段；本 helper 再把它进一步缩成 tail-outcome 专用 contract
- `TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper` 继续消费这里返回的窄 planning-context，并把最终 `{ tailStatePlan, completionDebugPlan }` 顶层返回交给 `TrailingAssistantPatchTailOutcomePlanHelper`
