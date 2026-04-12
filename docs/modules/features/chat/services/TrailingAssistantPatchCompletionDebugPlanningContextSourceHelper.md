# TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug planning-context source 的 service 侧桥接从 `ConversationRenderService` 抽成了独立 helper：

- 接收已经缩好的 tail-outcome `planningContext`
- 把 `tailStatePlan` 与消息摘要函数继续委托给独立 contract helper 统一收束
- 让 `ConversationRenderService` 不再直接关心 completion-debug source contract 的字段拼装

它不负责计算 tail-message summary、不生成最终 planning-context，也不拥有最终 source contract shape；只负责面向 service 的桥接入口。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlanningContextSourceParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: {
    shouldStickToBottom: boolean;
  };
  summarizeChatMessageForDebug(
    message: ChatMessage | null | undefined,
  ): Record<string, unknown> | null;
};

export function buildTrailingAssistantPatchCompletionDebugPlanningContextSource(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextSourceParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource;
```

## 与其他模块的关系

- `ConversationRenderService` 现在先调用这里装配 completion-debug source，再交给 `TrailingAssistantPatchCompletionDebugPlanningContextHelper`
- `TrailingAssistantPatchTailOutcomePlanningContextHelper` 继续负责更上游的共享 tail-outcome contract 收束
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 负责最终 `{ ...planningContext, tailStatePlan, summarizeChatMessageForDebug }` source contract 的纯装配
- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 继续负责消费这里返回的 source，并生成更窄的 completion-debug planning-context
