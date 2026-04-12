# TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper` 负责 trailing-assistant completion-debug tail-outcome 子链里最窄的一层 tail-outcome source-contract 纯装配：

- 接收共享的 tail-outcome `planningContext`、已算好的 `tailStatePlan` 与消息摘要函数
- 把 tail-outcome 命名边界固定在独立 helper 中，再委托 `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 返回稳定 source contract
- 让 `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 退出最底层 source-contract 命名与装配细节，只保留 planning-context / final-plan 编排

它不生成 completion-debug planning-context，也不展开最终 `completionDebugPlan`；只负责 “tail-outcome parts → completion-debug source contract” 这层纯收口。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: {
    shouldStickToBottom: boolean;
  };
  summarizeChatMessageForDebug(
    message: ChatMessage | null | undefined,
  ): Record<string, unknown> | null;
};

export function buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper` 现在先通过这里收束 tail-outcome source contract，再继续装配 completion-debug planning-context 与最终 plan
- `TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper` 继续负责真正的最终 source-contract shape 装配；这里仅补上 tail-outcome 边界命名
- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 继续消费这里返回的稳定 source contract
