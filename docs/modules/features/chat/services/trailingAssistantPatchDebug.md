# trailingAssistantPatchDebug

> **源码**: `src/features/chat/services/trailingAssistantPatchDebug.ts`
> **状态**: [REVIEW]

## 概述

`trailingAssistantPatchDebug` 是 assistant finalization debug 的 central owner。它持有完整的 debug stage allowlist、allowlist gate check 和 finalization debug log emitter，并继续承担 trailing-assistant patch completion/skipped 两条路径的 logging context、payload shape、shared log-plan coordination 与最终 emitter 统一发射。所有 assistant finalization 相关的 debug 输出（包括 render diagnostics、stream visibility、server sync 等）都通过这个模块的 `logAssistantFinalizationDebug()` 函数统一 gate + emit。

## 责任边界

- 持有 `ASSISTANT_DEBUG_STAGE_ALLOWLIST`，定义所有允许输出的 debug stage label
- 提供 `shouldLogAssistantFinalizationDebug()` gate check
- 提供 `logAssistantFinalizationDebug()` 统一 log emitter（allowlist gate + payload stringify + logger.debug）
- 提供 `stringifyLogPayload()` payload 序列化（JSON.stringify + fallback）
- 提供 `getLogPreview()` 文本截断预览（whitespace normalization + ellipsis）
- 构造 completion / skipped logging context
- 生成 completion / skipped payload inputs 与 payload plan
- 复用共享 coordinator 注入 `tabId` 并产出最终 `DebugLogPlan`
- 统一调用 host 的 `logAssistantFinalizationDebug()`

## 公开接口

```typescript
export function shouldLogAssistantFinalizationDebug(label: string): boolean;
export function logAssistantFinalizationDebug(label: string, payload: unknown): void;
export function stringifyLogPayload(payload: unknown): string;
export function getLogPreview(text: string, maxLength?: number): string;
export function previewLogText(text: string, maxLength?: number): string;
export function createDebugLogCallbacks(): {
  logAssistantFinalizationDebug: (label: string, payload: unknown) => void;
  getLogPreview: (text: string, maxLength: number) => string;
  stringifyLogPayload: (payload: unknown) => string;
};

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

- `OpenCodianView` 在多个 host adapter factory 中通过 `createDebugLogCallbacks()` spread 注入 `logAssistantFinalizationDebug`、`stringifyLogPayload`、`getLogPreview`，单行预览使用 `previewLogText()`；view 本身不再出现这些函数的裸名
- `ConversationRenderService` 在 success/failure 分支只负责构造高层上下文并调用这里的 emitter
- `ConversationRenderRuntime`、`ConversationAuthoritativeSyncCoordinator`、`ConversationAuthoritativeMessageMergeCoordinator` 等服务的 host 接口仍保留 `logAssistantFinalizationDebug` 回调签名；OpenCodianView 装配时传入导入的函数
- `trailingAssistantPatchPlanning.ts` 产出的 `completionDebugPlan` 会在这里被转换成最终 debug payload
- `trailingAssistantPatchTypes.ts` 保持 logging context 与 payload contract 在 tests / runtime 间一致

## 注意事项

- trailing-assistant debug 相关新增字段时，优先在这里补齐 payload/context，而不是重新引入单用途 `Debug*Helper.ts`
- 保持 `patch-trailing-assistant-render-complete` 与 `patch-trailing-assistant-render-skipped` 两个 label 不变
- 新增 debug stage label 时，必须同步更新 `ASSISTANT_DEBUG_STAGE_ALLOWLIST`
- `OpenCodianView` 不再拥有 `shouldLogAssistantFinalizationDebug`、`logAssistantFinalizationDebug`、`stringifyLogPayload` 或 `getLogPreview` 私有方法，也不再在源码文本中包含这些函数名；所有接线通过 `createDebugLogCallbacks()` 工厂完成
