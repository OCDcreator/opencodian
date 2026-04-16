# TrailingAssistantPatchDebugLogCoordinator

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLogCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLogCoordinator` 把 trailing-assistant completion / skipped debug 里仍然对称的共享日志编排骨架抽成了独立纯 helper：

- 从各自的 `loggingContext` 提取 `payloadInputs`
- 组装共享的 log `planningContext`
- 调用分支私有的 payload helper 生成 ready `payloadPlan`
- 把 `label`、`tabId` 与 ready `payloadPlan` 继续交给 `TrailingAssistantPatchDebugLogHelper`

它不触碰 `ConversationRenderHost`、DOM、分支专有的 log-plan wrapper、最终日志发送或具体的 payload 细节；只负责共享的 “logging context → planning context → payloadPlan → final log plan” 协调骨架。

## 公开接口

```typescript
export function buildTrailingAssistantPatchDebugLogPlanFromLoggingContext<
  LoggingContext,
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
  Label extends string,
>(
  coordinator: {
    label: Label;
    loggingContext: LoggingContext;
    buildPayloadInputsFromLoggingContext(
      loggingContext: LoggingContext,
    ): PayloadInputs;
    buildPayloadPlan(payloadInputs: PayloadInputs): PayloadPlan;
    getTabId(loggingContext: LoggingContext): TabId | null;
  },
): TrailingAssistantPatchDebugLogPlan<Label>;
```

## 与 `ConversationRenderService` 的关系

- `ConversationRenderService` 现在主要只负责在 patch 成功/失败点构造 logging context；completion / skipped 的 logging-context builder 已迁到 `TrailingAssistantPatchDebugLoggingContextHelper`
- completion / skipped 两条路径最外层的 log-plan builder 已迁到 `TrailingAssistantPatchDebugLogPlanHelper`
- completion / skipped 两条路径的最终日志发送包装已迁到 `TrailingAssistantPatchDebugLogEmitterHelper`
- service 不再直接触碰 coordinator 或 final-log 发送细节，而是把现成 logging context 交给 emitter helper
- completion / skipped 两条路径各自的 payload-inputs 与 payload-plan 细节已迁到 `TrailingAssistantPatchDebugPayloadHelper`
- 顶层共享的 log planning-context 装配与 final-log plan 协调迁到这里
- 真正的 final-log payload 注入与 shape 仍由 `TrailingAssistantPatchDebugLogHelper` 负责
