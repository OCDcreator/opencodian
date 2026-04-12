# TrailingAssistantPatchCompletionDebugPlanningContextHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanningContextHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug planning-context 的纯装配收束在独立 helper：

- 接收已经由 source helper 组好的 tail-outcome planning-context 风格 source：tail messages、`messageEl`、`shouldStickToBottom`、`tailStatePlan` 与消息摘要函数
- 在 helper 内部改为读取 `tailStatePlan.shouldStickToBottom`，把 tail-message summary 委托给 `TrailingAssistantPatchCompletionDebugSummaryPlanHelper`
- 再把最终 `{ shouldStickToBottom, summaryPlan }` shape 装配委托给 `TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper`
- 保持下游 `TrailingAssistantPatchCompletionDebugPlanHelper.buildTrailingAssistantPatchCompletionDebugPlan()` 继续消费同一份稳定的 completion-debug contract

它不负责最终 `completionDebugPlan` shape、不处理 tail-state plan，也不发送任何 debug 日志；只负责 completion-debug planning-context 的纯输入收口。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: {
      shouldStickToBottom: boolean;
    };
    summarizeChatMessageForDebug(
      message: ChatMessage | null | undefined,
    ): Record<string, unknown> | null;
  };

export type TrailingAssistantPatchCompletionDebugPlanningContext = {
  shouldStickToBottom: boolean;
  summaryPlan: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
};

export function buildTrailingAssistantPatchCompletionDebugPlanningContext(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugPlanningContext;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 现在先通过 `TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper` 收束 tail-outcome source，再把结果交给这里，不让更上游模块直接串联最底层 source-contract 装配
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责收束 tail messages、`messageEl` 与 `shouldStickToBottom` 的共享 tail-outcome contract；本 helper 再把它进一步缩成 completion-debug 专用 contract
- `TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper` 负责给这里补上 tail-outcome 命名边界后的稳定 source contract
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 负责定义并装配这里消费的稳定 completion-debug source contract
- `TrailingAssistantPatchCompletionDebugSummaryPlanHelper` 负责把 source 中的 tail messages 与摘要函数进一步收束成 `summaryPlan`
- `TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper` 负责把已经收窄的 `shouldStickToBottom` 与 `summaryPlan` 组装成最终 planning-context shape
- `TrailingAssistantPatchCompletionDebugPlanHelper` 继续消费这里返回的窄 planning-context，并把最终 `completionDebugPlan` 交给 logging-context / emitter helper 链使用
