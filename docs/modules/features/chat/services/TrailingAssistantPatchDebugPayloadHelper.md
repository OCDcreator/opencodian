# TrailingAssistantPatchDebugPayloadHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugPayloadHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugPayloadHelper` 把 trailing-assistant completion / skipped debug 里分支私有的 payload 组装进一步抽成了独立纯 helper：

- completion 分支：把 `completionDebugPlan` 收束成稳定的 payload inputs / payload plan
- skipped 分支：把 `reason`、失败 `payload` 与 rendered-count 统计收束成 payload inputs / payload plan
- 保持 payload 字段顺序、`previousRenderedCount` / `nextRenderedCount` 注入位置，以及最终 spread 行为不变

它不接触 `ConversationRenderHost` 的日志输出、shared coordinator 或 final-log payload 注入；只负责分支私有的 debug payload 适配。

## 公开接口

```typescript
export function buildTrailingAssistantPatchCompletionDebugPayloadInputs(
  completionDebugPlan: {
    shouldStickToBottom: boolean;
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  },
): TrailingAssistantPatchCompletionDebugPayloadInputs;

export function buildTrailingAssistantPatchCompletionDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchCompletionDebugPayloadInputs,
): TrailingAssistantPatchCompletionDebugPayloadPlan;

export function buildTrailingAssistantPatchSkippedDebugPayloadInputs(
  payloadInputSource: {
    reason: string;
    payload: Record<string, unknown>;
    previousMessages: ChatMessage[];
    nextMessages: ChatMessage[];
    getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  },
): TrailingAssistantPatchSkippedDebugPayloadInputs;

export function buildTrailingAssistantPatchSkippedDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchSkippedDebugPayloadInputs,
): TrailingAssistantPatchSkippedDebugPayloadPlan;
```

## 与其他 helper 的关系

- `ConversationRenderService` 现在只负责触发 completion / skipped debug logging，并把最小化的分支上下文传给 helper
- `TrailingAssistantPatchDebugLogCoordinator` 继续负责共享的 `loggingContext → planningContext → final log plan` 骨架
- `TrailingAssistantPatchDebugLogHelper` 继续负责最终 `tabId` 注入与 final-log payload shape
