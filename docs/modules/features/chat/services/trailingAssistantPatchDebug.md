# trailingAssistantPatchDebug

> **源码**: `src/features/chat/services/trailingAssistantPatchDebug.ts`
> **状态**: [REVIEW]

## 概述

`trailingAssistantPatchDebug` 是 trailing-assistant patch 的 debug/logging bundle。它把 completion/skipped 两条路径的 logging context、payload shape、shared log-plan coordination 与最终 emitter 全部合并到同一个模块里，避免继续扩散 debug 专用微 helper。

## 责任边界

- 构造 completion / skipped logging context
- 生成 completion / skipped payload inputs 与 payload plan
- 复用共享 coordinator 注入 `tabId` 并产出最终 `DebugLogPlan`
- 统一调用 host 的 `logAssistantFinalizationDebug()`

## 公开接口

```typescript
export function buildTrailingAssistantPatchCompletionDebugLoggingContext(
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlanLike,
  tabId: TabId | null,
): TrailingAssistantPatchCompletionDebugLoggingContext;

export function buildTrailingAssistantPatchSkippedDebugLoggingContext(
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
  reason: string,
  payload: Record<string, unknown>,
): TrailingAssistantPatchSkippedDebugLoggingContext;

export function emitTrailingAssistantPatchCompletionDebugLog(
  loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  emitter: TrailingAssistantPatchDebugLogEmitter,
): void;
```

## 与其他模块的关系

- `ConversationRenderService` 在 success/failure 分支只负责构造高层上下文并调用这里的 emitter
- `trailingAssistantPatchPlanning.ts` 产出的 `completionDebugPlan` 会在这里被转换成最终 debug payload
- `trailingAssistantPatchTypes.ts` 保持 logging context 与 payload contract 在 tests / runtime 间一致

## 注意事项

- trailing-assistant debug 相关新增字段时，优先在这里补齐 payload/context，而不是重新引入单用途 `Debug*Helper.ts`
- 保持 `patch-trailing-assistant-render-complete` 与 `patch-trailing-assistant-render-skipped` 两个 label 不变
