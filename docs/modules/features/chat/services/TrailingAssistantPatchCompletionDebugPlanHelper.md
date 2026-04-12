# TrailingAssistantPatchCompletionDebugPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchCompletionDebugPlanHelper` 把 trailing-assistant tail-outcome 路径里 completion-debug plan 的最终 shape 装配从 `ConversationRenderService` 抽成了独立纯 helper：

- 接收已经收窄好的 completion-debug planning-context
- 统一把 `shouldStickToBottom` 与 `summaryPlan.previousTail / nextTail` 展开成稳定的最终 plan
- 让 `ConversationRenderService` 退出 completion-debug plan 的字段展开，只保留 tail-outcome 编排

它不读取 host、不处理 tail-state 或消息摘要，也不发送 debug 日志；只负责把既有 planning-context 收束成最终 `completionDebugPlan`。

## 公开接口

```typescript
export type TrailingAssistantPatchCompletionDebugPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export function buildTrailingAssistantPatchCompletionDebugPlan(
  planningContext: TrailingAssistantPatchCompletionDebugPlanningContext,
): TrailingAssistantPatchCompletionDebugPlan;
```

## 与其他模块的关系

- `TrailingAssistantPatchCompletionDebugPlanningContextHelper` 继续负责把 tail-outcome source 缩成 completion-debug 专用 planning-context
- `ConversationRenderService` 现在只负责把 tail-outcome planning-context、`tailStatePlan` 与摘要回调交给 planning-context helper，再把结果直接交给这里生成最终 plan
- `TrailingAssistantPatchDebugLoggingContextHelper` 与后续 emitter/helper 链继续消费这里返回的稳定 `completionDebugPlan`
