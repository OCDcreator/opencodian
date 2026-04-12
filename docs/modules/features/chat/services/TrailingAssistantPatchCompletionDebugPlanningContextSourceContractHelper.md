# TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug planning-context source 的最后一层 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` contract 装配从 `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 抽成了独立 pure helper：

- 接收共享 tail-outcome `planningContext`
- 追加 `tailStatePlan` 与消息摘要函数
- 统一返回 `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 消费的稳定 source contract

它不负责 `ConversationRenderService` 的桥接、不生成最终 planning-context，也不计算 tail-message summary；只负责 completion-debug source contract 的纯收束。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: {
    shouldStickToBottom: boolean;
  };
  summarizeChatMessageForDebug(
    message: ChatMessage | null | undefined,
  ): Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: {
      shouldStickToBottom: boolean;
    };
    summarizeChatMessageForDebug(
      message: ChatMessage | null | undefined,
    ): Record<string, unknown> | null;
  };

export function buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 现在把最终 source contract 装配委托给这里，自己只保留面向 service 的桥接入口
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续提供更上游的共享 tail-outcome planning-context
- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 继续消费这里返回的 source，并进一步收束成 completion-debug planning-context
