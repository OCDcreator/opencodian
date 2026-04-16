# ConversationHydrationOutcomeBridge

> **源码**: `src/features/chat/runtime/ConversationHydrationOutcomeBridge.ts`
> **状态**: [REVIEW]

## 概述

`ConversationHydrationOutcomeBridge` 把 loaded-conversation hydration 里消息装载完成后的稳定 outcome 收束成一个 dedicated bridge：它统一负责先重建 conversation-derived background-task runtime，再触发消息区重渲，随后复用 `TabViewActivationBridge` 刷新 post-render indicator / dock / status/question/todo outcome，最后提交新的 sync fingerprint baseline。

它不负责决定何时 resolve conversation、何时进入 hydration shell、何时做 scroll restore，或何时执行 hydration 尾段的 composer/model/context usage 写回；这些仍分别留给 `ConversationLoadRuntimeBridge`、`ConversationTransitionBridge`、`ConversationHydrationRenderBridge` 与 `TabViewActivationBridge`。bridge 只承接 loaded-conversation 在消息已经拿到之后那段稳定的“background-task rebuild → render → post-render outcome → baseline”路径。

## 公开接口

```typescript
export interface ConversationHydrationOutcomeBridgeHost {
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
}

export interface ConversationHydrationOutcomePort {
  applyLoadedConversationOutcome(
    tabId: TabId | null,
    conversation: Conversation,
    messages: ChatMessage[],
  ): Promise<void>;
}
```

## 关键行为

- `applyLoadedConversationOutcome()` 保持原有 loaded-conversation outcome 顺序：先 `syncBackgroundTaskStateFromConversation()`，再 `renderMessages()`，然后委托 `TabViewActivationBridge.applyLoadedConversationPostRenderOutcome()`，最后 `commitConversationSyncBaseline()`
- background-task runtime rebuild 继续基于当前 conversation 语义，不把 timeline 推导逻辑重新塞回装载服务
- post-render indicator / dock / status-question-todo lazy refresh 继续复用 `TabViewActivationBridge` 与 `QuestionTodoStatusRefreshCoordinator`
- sync baseline 提交继续复用 `TabConversationStateBridge`，bridge 自己不重新实现 fingerprint 规则或 sync loop 生命周期

## 与 `OpenCodianView` / `ConversationViewStateService` 的边界

- `OpenCodianView` 继续保留真正的 `syncBackgroundTaskStateFromConversation()`、`renderMessages()` 与 tab runtime 实现
- `ConversationViewStateService` 现在只保留 loaded-conversation 的 resolve / activation / transition / hydration-tail orchestration，不再直接持有消息装载后的 background-task rebuild、message rerender 与 baseline commit
- `TabViewActivationBridge` 继续负责 UI-only 的 post-render / hydration-tail writeback，但 loaded-conversation 的 post-render outcome 入口现在由本 bridge 统一触发
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移
