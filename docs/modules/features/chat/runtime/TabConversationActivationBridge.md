# TabConversationActivationBridge

> **源码**: `src/features/chat/runtime/TabConversationActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabConversationActivationBridge` 把 `OpenCodianView` 中当前活动 tab 的两条 activation/open 壳层路径收束到同一个 dedicated runtime bridge：一条是 current-tab 新建会话打开时的 background-task indicator reset、消息区清空、turn state reset、sync baseline 提交，以及 model/context usage、question/todo、background-task indicator 与 settled scroll 的后续刷新；另一条是 empty-tab 激活时的 active conversation 清空、消息区 shell reset 和 empty-state selector/context/dock outcome。

它不负责真正创建 conversation、显示 “new current tab created” 的 `Notice`、loaded-conversation hydration，或 tab/pane activation 的其它预刷新分支；这些仍分别留给 `OpenCodianView` 的命令入口、`ConversationViewStateService`、`ConversationTransitionBridge` 与 `TabViewActivationBridge`。bridge 只承接“当前活动 tab 进入 empty state”与“已经拿到一个新 conversation，并决定在当前 tab 直接打开它”这两条稳定 activation/open 路径。

## 公开接口

```typescript
export interface TabConversationActivationBridgeHost {
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

export class TabConversationActivationBridge {
  applyEmptyTabActivation(tabId: TabId): void;
  openConversation(conversation: Conversation): void;
}
```

## 关键行为

- `applyEmptyTabActivation()` 继续复用 `TabConversationStateBridge.clearActiveConversation()` 和 `TabViewActivationBridge.applyEmptyActivationOutcome()`，bridge 自己只承接中间那段消息区清空 / turn reset 的 active-pane shell
- `openConversation()` 只在 current conversation id 变化时重置 background-task indicator，保持原有的 same-conversation reopen 语义
- active-tab conversation/session 写回与 sync baseline 提交继续分别复用 `TabConversationStateBridge.applyActiveConversation()` 和 `commitConversationSyncBaseline()`，bridge 自己不重新实现这些状态规则
- current-tab open shell 保持原有顺序：state writeback → 消息区清空/turn reset → baseline commit → selector/context identity → background-task runtime rebuild → todo dock → question dock → `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()` → indicator/context usage async refresh → settled scroll
- 这样 `OpenCodianView` 不再直接内联 empty-tab activation 或 current-tab open 路径上的多段 host orchestration，只保留命令入口与 bridge 装配

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的消息容器 DOM、question/todo dock、model/context usage 与 background-task indicator 实现
- `TabConversationStateBridge` 继续负责 active-tab conversation/session 写回、empty-state clear 与 sync baseline；`TabViewActivationBridge` 继续负责 activation 预刷新和 empty-state outcome UI；`QuestionTodoStatusRefreshCoordinator` 继续负责 status + pending-question + todo 的 supplemental refresh 顺序
- `TabConversationActivationBridge` 只组合这些稳定边界，承接当前活动 tab 的 empty-state activation 与 current-tab new conversation open runtime/UI shell
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移
