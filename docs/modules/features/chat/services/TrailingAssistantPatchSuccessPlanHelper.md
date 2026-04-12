# TrailingAssistantPatchSuccessPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchSuccessPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchSuccessPlanHelper` 把 trailing-assistant patch success-plan 的最终顶层 shape 装配从 `ConversationRenderService` 抽成了独立纯 helper：

- 接收已分别算好的 `executionPlan`、`tailOutcomePlans` 与 `turnBodyScopePlan`
- 统一返回稳定的 `TrailingAssistantPatchSuccessPlan` contract
- 让 `ConversationRenderService` 在 success-plan 阶段只协调 execution、tail-outcome 与 turn-body scope 三个既成子计划

它不比较正文签名、不构建 tail-state 或 completion-debug plan，也不执行任何 DOM/runtime 副作用；只负责 success-plan 最终 shape 的纯装配。

## 公开接口

```typescript
export type TrailingAssistantPatchExecutionPlan =
  | {
    kind: 'finalize-footer';
    messageEl: HTMLElement;
    nextTailMessage: ChatMessage;
  }
  | {
    kind: 'rerender-content';
    messageEl: HTMLElement;
    contentEl: HTMLElement;
    nextTailMessage: ChatMessage;
  };

export type TrailingAssistantPatchSuccessPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export type TrailingAssistantPatchSuccessPlan = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailStatePlan: TrailingAssistantPatchTailOutcomePlans['tailStatePlan'];
  completionDebugPlan: TrailingAssistantPatchTailOutcomePlans['completionDebugPlan'];
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export function buildTrailingAssistantPatchSuccessPlanFromParts(
  planParts: TrailingAssistantPatchSuccessPlanParts,
): TrailingAssistantPatchSuccessPlan;
```

## 与其他模块的关系

- `ConversationRenderService` 现在只负责组装 success-plan parts，并把最终 shape 收口委托给这里
- `TrailingAssistantPatchTailOutcomePlanHelper` 继续负责 `{ tailStatePlan, completionDebugPlan }` 这一层 tail-outcome shape
- `TrailingAssistantPatchTurnBodyScopePlanHelper` 与 execution plan 分支仍分别负责各自子计划的预计算
