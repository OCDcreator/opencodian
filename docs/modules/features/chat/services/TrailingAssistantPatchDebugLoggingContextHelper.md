# TrailingAssistantPatchDebugLoggingContextHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLoggingContextHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLoggingContextHelper` 把 trailing-assistant completion / skipped debug 里最后还留在 `ConversationRenderService` 内的 logging-context builder 抽成了独立纯 helper：

- completion 分支：把 `completionDebugPlan` 与 `tabId` 收束成最小 logging context
- skipped 分支：先复用 `previousMessages` / `nextMessages` / `tabId` 组成 planning context，再按失败原因与 payload 生成 logging context
- 保持 completion / skipped debug log 触发时机、context 字段结构，以及传给 coordinator 的 shape 不变

它不负责 payload 统计、不负责 final-log 组装，也不触碰 `ConversationRenderHost`；只负责分支私有的 debug context 装配。

## 公开接口

```typescript
export function buildTrailingAssistantPatchCompletionDebugLoggingContext(
  completionDebugPlan: {
    shouldStickToBottom: boolean;
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  },
  tabId: TabId | null,
): TrailingAssistantPatchCompletionDebugLoggingContext;

export function buildTrailingAssistantPatchSkippedDebugPlanningContext(
  previousMessages: ChatMessage[],
  nextMessages: ChatMessage[],
  tabId: TabId | null,
): TrailingAssistantPatchSkippedDebugPlanningContext;

export function buildTrailingAssistantPatchSkippedDebugLoggingContext(
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
  reason: string,
  payload: Record<string, unknown>,
): TrailingAssistantPatchSkippedDebugLoggingContext;
```

## 与其他 helper 的关系

- `ConversationRenderService` 现在只负责在 completion / skipped 分支调用这些纯 builder，再把结果交给共享日志链
- `TrailingAssistantPatchDebugPayloadHelper` 继续负责 completion / skipped payload inputs 与 payload-plan 适配
- `TrailingAssistantPatchDebugLogCoordinator` 继续负责 `loggingContext → planningContext → final log plan` 的共享编排
