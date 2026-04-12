# CurrentTabConversationOpenBridge

> **源码**: `src/features/chat/runtime/CurrentTabConversationOpenBridge.ts`
> **状态**: [REVIEW]

## 概述

`CurrentTabConversationOpenBridge` 把 `OpenCodianView.openConversationInCurrentTab()` 里原本仍由 view 自己持有的 current-tab open shell 收束成一个 dedicated runtime bridge：它统一负责切到当前 tab 新 conversation 时的 background-task indicator reset、消息区清空、turn state reset、sync baseline 提交，以及 model/context usage、question/todo、background-task indicator 与 settled scroll 的后续刷新顺序。

它不负责真正创建 conversation、显示 “new current tab created” 的 `Notice`、loaded-conversation hydration，或 tab/pane activation 的其它分支；这些仍分别留给 `OpenCodianView` 的命令入口、`ConversationViewStateService`、`ConversationTransitionBridge` 与 `TabViewActivationBridge`。bridge 只承接“已经拿到一个新 conversation，并决定在当前 tab 直接打开它”这条稳定路径。

## 公开接口

```typescript
export interface CurrentTabConversationOpenBridgeHost {
  getCurrentConversationId(): string | null;
  getActiveTabId(): TabId | null;
  resetBackgroundTaskIndicator(): void;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId: TabId | null): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  renderQuestionDock(): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId: TabId | null): Promise<void>;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export class CurrentTabConversationOpenBridge {
  openConversation(conversation: Conversation): void;
}
```

## 关键行为

- `openConversation()` 只在 current conversation id 变化时重置 background-task indicator，保持原有的 same-conversation reopen 语义
- active-tab conversation/session 写回与 sync baseline 提交继续分别复用 `TabConversationStateBridge.applyActiveConversation()` 和 `commitConversationSyncBaseline()`，bridge 自己不重新实现这些状态规则
- current-tab open shell 保持原有顺序：state writeback → 消息区清空/turn reset → baseline commit → selector/context identity → background-task runtime rebuild → todo dock → question dock → `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()` → indicator/context usage async refresh → settled scroll
- 这样 `OpenCodianView` 不再直接内联 current-tab open 路径上的多段 host orchestration，只保留命令入口与 bridge 装配

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的消息容器 DOM、question/todo dock、model/context usage 与 background-task indicator 实现
- `TabConversationStateBridge` 继续负责 active-tab conversation/session 写回与 sync baseline；`QuestionTodoStatusRefreshCoordinator` 继续负责 status + pending-question + todo 的 supplemental refresh 顺序
- `CurrentTabConversationOpenBridge` 只组合这些稳定边界，承接 current-tab new conversation open 的 runtime/UI shell
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移
