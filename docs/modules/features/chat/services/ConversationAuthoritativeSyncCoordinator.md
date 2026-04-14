# ConversationAuthoritativeSyncCoordinator

> **源码**: `src/features/chat/services/ConversationAuthoritativeSyncCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationAuthoritativeSyncCoordinator` 把 `OpenCodianView` 里 authoritative sync merge 这一整段高风险 lifecycle 收束到单独 owner，统一负责：

- server message 拉取、hydrate 与 revert-state 查询
- authoritative merge 时的 client-only field / modelId / interrupted message preservation
- latest optimistic user bubble 的 server hydration、visible-text guard 与 hydrated writeback
- sync fingerprint、preserved-interrupted logging，以及 merge/fetch/finish debug payload 组装

它不负责 tab 选择、signal debounce、visible/background post-sync 路由，也不直接决定 DOM patch 策略；这些仍分别留在 `ConversationSyncOrchestrationService`、`ConversationSyncBridge`、`ConversationRenderService` 与 `OpenCodianView` 的 render host seam。

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

- `syncConversationMessagesFromServer()` 会先拉取 server messages，再统一执行 hydrate、renderable filter、OMO background-task diagnostics、client-only merge 与 interrupted-message preservation。
- merge 结果仍然按 timestamp 排序，并继续用 per-tab `lastConversationSyncFingerprint` 判断本轮是否真的发生 authoritative 变化。
- 当 server assistant 缺少 tool metadata / rich content blocks 时，`mergeClientOnlyMessageFields()` 仍会优先保留本地更完整的 assistant payload。
- `syncLatestUserMessageFromServer()` 仍保留 optimistic user bubble 的 visible-text mismatch guard；只有 source/message text 真正对齐时才会替换本地 message，并继续触发 hydrated anchor writeback 与单条 user rerender。
- preserved interrupted assistants 的去重日志 fingerprint 现在随 runtime 一起经由 host 写回，避免重复刷相同 preservation 日志。

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 只保留 host seam 与少量 render/runtime helper：fingerprint 算法、hydrated anchor writeback、single-message rerender、background-task authoritative-sync 标记与 context usage refresh。
- `ConversationAuthoritativeSyncCoordinator` 统一承接 authoritative merge / hydration / preservation / logging 的完整生命周期。
- 这次切口对应 maintainability roadmap 的 `R43 - OpenCodianView authoritative sync merge seam`，目标是让主 view 不再直接铺开这整段 sync-merge / hydration 写回逻辑。
