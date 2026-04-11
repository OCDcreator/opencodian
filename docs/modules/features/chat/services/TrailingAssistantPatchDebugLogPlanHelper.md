# TrailingAssistantPatchDebugLogPlanHelper

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLogPlanHelper.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLogPlanHelper` 把 trailing-assistant completion / skipped debug 的分支专有 log-plan builder 抽成了独立纯 helper：

- completion 分支：把现成的 completion logging context 交给共享 coordinator，并复用 completion payload helper 生成最终 log plan
- skipped 分支：把 skipped logging context 与 `getMessagesForRender()` 回调收束成共享 coordinator 可消费的输入，再复用 skipped payload helper 生成最终 log plan
- 保持 `label`、`tabId`、rendered-count 统计方式、payload 字段顺序，以及最终日志输出 shape 不变

它不接触 `ConversationRenderHost`、DOM 或实际日志发送；只负责 completion / skipped 两条路径最外层的 log-plan 适配，最终发送由 `TrailingAssistantPatchDebugLogEmitterHelper` 统一触发。

## 公开接口

```typescript
export function buildTrailingAssistantPatchCompletionDebugLogPlan(
  loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
): TrailingAssistantPatchCompletionDebugLogPlan;

export function buildTrailingAssistantPatchSkippedDebugLogPlan(
  loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[],
): TrailingAssistantPatchSkippedDebugLogPlan;
```

## 与其他 helper 的关系

- `ConversationRenderService` 现在只负责在成功/失败点构造 logging context，并把 context 交给 emitter helper
- `TrailingAssistantPatchDebugLogEmitterHelper` 负责调用这里的 helper 取得 ready log plan，并触发最终 finalization debug logger
- `TrailingAssistantPatchDebugLoggingContextHelper` 继续负责 completion / skipped logging context 的纯组装
- `TrailingAssistantPatchDebugPayloadHelper` 继续负责 completion / skipped payload inputs 与 payload-plan 适配
- `TrailingAssistantPatchDebugLogCoordinator` 继续负责共享的 `loggingContext → planningContext → payloadPlan → final log plan` 骨架
- `TrailingAssistantPatchDebugLogHelper` 继续负责最终 `tabId` 注入与 final-log payload shape
