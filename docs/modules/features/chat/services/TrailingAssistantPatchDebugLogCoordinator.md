# TrailingAssistantPatchDebugLogCoordinator

> **源码**: `src/features/chat/services/TrailingAssistantPatchDebugLogCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`TrailingAssistantPatchDebugLogCoordinator` 把 trailing-assistant completion / skipped debug 里仍然对称的顶层日志编排链抽成了独立纯 helper：

- 从各自的 `loggingContext` 提取 `payloadInputs`
- 组装共享的 log `planningContext`
- 用分支自己的 `payloadPlan` builder 生成 ready payload
- 把 `label`、`tabId` 与 ready `payloadPlan` 继续交给 `TrailingAssistantPatchDebugLogHelper`

它不触碰 `ConversationRenderHost`、DOM 或具体的 payload 细节；只负责共享的 “logging context → planning context → payloadPlan → final log plan” 协调骨架。

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

- `ConversationRenderService` 继续保留 completion / skipped 两条路径各自的 payload-inputs 与 payload-plan 细节
- 顶层共享的 log planning-context 装配与 final-log plan 协调迁到这里
- 真正的 final-log payload 注入与 shape 仍由 `TrailingAssistantPatchDebugLogHelper` 负责
