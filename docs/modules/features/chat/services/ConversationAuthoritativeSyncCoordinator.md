# ConversationAuthoritativeSyncCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeSyncCoordinator` 现在作为 authoritative sync facade，保留 latest-user hydration owner，并把 conversation reload / merge 细节继续压回相邻厚 owner。它统一负责：

- latest optimistic user bubble 的 server hydration、visible-text guard 与 hydrated writeback
- 对外暴露稳定的 `mergeClientOnlyMessageFields()` / `syncConversationMessagesFromServer()` / `syncLatestUserMessageFromServer()` 入口
- 把 conversation reload / auth-sync lifecycle 委托给 `ConversationAuthoritativeReloadCoordinator`
- 把 client-only field / modelId / rich block merge 规则委托给 `ConversationAuthoritativeMessageMergeCoordinator`

它仍不负责 tab 选择、signal debounce、visible/background post-sync 路由，也不直接决定 DOM patch 策略；这些仍分别留在 `ConversationSyncOrchestrationService`、`ConversationSyncBridge`、`ConversationRenderService` 与 `OpenCodianView` 的 render host seam。

## 公开接口

```typescript
export interface ConversationAuthoritativeSyncHost {
  getSessionMessages(sessionId: string): Promise<...>;
  getSessionRevertState(sessionId: string): Promise<...>;
  hydrateOpenCodeMessage(...): ChatMessage;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  getInterruptedSyncPreservationLogFingerprint(...): string;
  refreshContextUsageAfterActiveConversationSync(...): Promise<void>;
  updateHydratedUserMessageRuntimeAnchors(...): void;
  rerenderSingleUserMessage(...): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(...): Promise<void>;
  ...
}

export class ConversationAuthoritativeSyncCoordinator {
  mergeClientOnlyMessageFields(...): ChatMessage;
  syncLatestUserMessageFromServer(...): Promise<void>;
  syncConversationMessagesFromServer(...): Promise<...>;
}
```

## 关键行为

- `syncConversationMessagesFromServer()` 仍保留原有 public contract，但 conversation-level reload / auth-sync 细节已转交给 `ConversationAuthoritativeReloadCoordinator`。
- `mergeClientOnlyMessageFields()` 仍保留原有 public contract，但实际 field/model merge 规则已转交给 `ConversationAuthoritativeMessageMergeCoordinator`。
- `syncLatestUserMessageFromServer()` 继续保留 optimistic user bubble 的 visible-text mismatch guard；只有 source/message text 真正对齐时才会替换本地 message，并继续触发 hydrated anchor writeback 与单条 user rerender。
- host 依赖与外部调用方式保持不变，因此 `ConversationSyncBridge`、send pipeline 与 view wrapper 不需要感知这次内部 owner 收口。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host seam 与少量 render/runtime helper：fingerprint 算法、hydrated anchor writeback、single-message rerender、background-task authoritative-sync 标记与 context usage refresh。
- `ConversationAuthoritativeSyncCoordinator` 现在聚焦 public facade 与 latest-user hydration；conversation reload / merge 细节继续压回 `ConversationAuthoritativeReloadCoordinator` 与 `ConversationAuthoritativeMessageMergeCoordinator`。
- 当前这次收口对应 maintainability roadmap 的 `R139 - Conversation authoritative sync residual seam`，目标是在不改变 auth-sync / reload 行为的前提下，进一步压缩内部混杂的 reload decision 与 merge responsibility。
