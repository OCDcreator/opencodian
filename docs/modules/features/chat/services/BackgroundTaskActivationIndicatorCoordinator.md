# BackgroundTaskActivationIndicatorCoordinator

> **源码**: `src/features/chat/services/BackgroundTaskActivationIndicatorCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`BackgroundTaskActivationIndicatorCoordinator` 把 activation/open 路径里紧邻 question/todo refresh 的 **background-task indicator reset + conversation-derived runtime rebuild + indicator render trigger** 收束成一个更窄的 P2 coordinator。它专门负责：

- 在 current-tab open conversation 时，只在 conversation id 变化时重置 background-task indicator
- 在 current-tab open 路径里复用 `syncBackgroundTaskStateFromConversation()` 重建 background-task runtime
- 为 `TabConversationActivationBridge` 提供 fire-and-forget 的 open-side indicator render trigger
- 为 `TabViewActivationBridge` 提供 loaded-conversation post-render 的 awaited indicator render

它不负责 live-signal reconcile、inline panel render、completion notice queue/flush，或 activation-side question/todo refresh；这些职责仍分别留给 `BackgroundTaskIndicatorCoordinator`、`BackgroundTaskTimelineService` 与 `QuestionTodoActivationRefreshCoordinator`。它只承接 activation/open 入口上那段稳定的 background-task indicator writeback。

## 公开接口

```typescript
export interface BackgroundTaskActivationIndicatorCoordinatorHost {
  getCurrentConversationId(): string | null;
  resetBackgroundTaskIndicator(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
}

export class BackgroundTaskActivationIndicatorCoordinator {
  prepareOpenConversation(conversation: Conversation): void;
  syncOpenConversationState(conversation: Conversation, tabId: TabId | null): void;
  renderOpenConversationIndicator(tabId: TabId | null): void;
  renderLoadedConversationIndicator(tabId: TabId | null): Promise<void>;
}
```

## 关键行为

- `prepareOpenConversation()` 保持原有 same-conversation reopen 语义：只有 current conversation id 变化时才 reset indicator
- `syncOpenConversationState()` 只负责把 conversation-derived background-task runtime rebuild 落回 host，不改动 question/todo 或 context usage
- `renderOpenConversationIndicator()` 保持 current-tab open 路径的 fire-and-forget render 触发，不阻塞后续 context usage refresh 与 settled scroll
- `renderLoadedConversationIndicator()` 保持 loaded-conversation post-render 路径的 awaited indicator render，再交回 activation-side question/todo refresh
- `TabConversationActivationBridge` 与 `TabViewActivationBridge` 现在共享同一条 activation/open-side background-task indicator writeback 边界，而不是各自直接持有 reset/sync/render host callback

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留 `resetBackgroundTaskIndicator()`、`syncBackgroundTaskStateFromConversation()` 与 `renderBackgroundTaskIndicatorIfNeeded()` 的真实实现
- `BackgroundTaskIndicatorCoordinator` 继续负责 render 内部的 live-signal reconcile、inline panel render、completion notice queue/flush 与 stream-like sync
- `TabConversationActivationBridge` 只保留 current-tab open shell/outcome 编排，不再直接判断是否 reset indicator，也不再直接持有 background-task runtime rebuild / render host
- `TabViewActivationBridge` 只保留 loaded-conversation post-render outcome 的 question/todo 编排，不再直接持有 awaited indicator render host
- 这条边界推进的是 master plan 的 P2 `question / todo / background task` lane：继续从 activation/open-side entrypoint 收窄 `OpenCodianView` host surface
