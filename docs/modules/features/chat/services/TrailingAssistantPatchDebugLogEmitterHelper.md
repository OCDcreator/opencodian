# TrailingAssistantPatchDebugLogEmitterHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLogEmitterHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLogEmitterHelper` 把 trailing-assistant completion / skipped debug 里最后的 finalization log 发送包装从 `ConversationRenderService` 抽成了小型副作用 helper：

- completion 分支：接收 completion logging context，复用 log-plan helper 生成 ready log plan，再调用 finalization logger
- skipped 分支：接收 skipped logging context 与 host 的 `getMessagesForRender()` 能力，复用 log-plan helper 生成 ready log plan，再调用 finalization logger
- 保持 `label`、`tabId`、payload shape、rendered-count 统计方式与最终 `logAssistantFinalizationDebug()` 调用不变

它不接触 DOM、patch 执行或 success / skipped 分支判定；只负责把 ready log plan 发送到 host 提供的 finalization debug logger。

## 公开接口

```typescript
export function emitTrailingAssistantPatchCompletionDebugLog(
  loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  emitter: {
    logAssistantFinalizationDebug(label: string, payload: unknown): void;
  },
): void;

export function emitTrailingAssistantPatchSkippedDebugLog(
  loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  emitter: {
    getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
    logAssistantFinalizationDebug(label: string, payload: unknown): void;
  },
): void;
```

## 与其他 helper 的关系

- `ConversationRenderService` 现在只在 patch 成功/失败点构造 logging context，并把最终日志发送交给这里
- `TrailingAssistantPatchDebugLogPlanHelper` 继续负责 completion / skipped 两条路径的 final log plan 组装
- `TrailingAssistantPatchDebugPayloadHelper` 继续负责分支私有 payload inputs 与 payload plan
- `TrailingAssistantPatchDebugLogCoordinator` 继续负责共享的 `loggingContext → planningContext → payloadPlan → final log plan` 骨架
