# TabConversationActivationBridge

> **源码**: `src/features/chat/runtime/TabConversationActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabConversationActivationBridge` 把 `OpenCodianView` 中当前活动 tab 的 activation/open 壳层路径收束到同一个 dedicated runtime bridge：一条是 streaming tab 激活时的 active-conversation/session 写回、sync baseline 提交，以及 streaming selector/context/send-button outcome；一条是 loaded-conversation hydration 前的 active-conversation/session 写回与 background-task suppressed fingerprint reset；一条是 current-tab 新建会话打开时的消息区清空、turn state reset、sync baseline 提交，以及 model/context usage、activation-side question/todo refresh、background-task indicator 与 settled scroll 的后续刷新；另一条是 empty-tab 激活时的 active conversation 清空、消息区 shell reset 和 empty-state selector/context/dock outcome。open-side 的 background-task indicator reset / runtime rebuild / render trigger 现在统一委托给 `BackgroundTaskActivationIndicatorCoordinator`，而相邻的 context usage identity / snapshot writeback 则统一委托给 `ActiveTabContextUsageCoordinator`。

它不负责真正创建 conversation、显示 “new current tab created” 的 `Notice`、loaded-conversation hydration render/post-render，或 tab/pane activation 的其它预刷新分支；这些仍分别留给 `OpenCodianView` 的命令入口、`ConversationViewStateService`、`ConversationTransitionBridge` 与 `TabViewActivationBridge`。bridge 只承接“当前活动 tab 进入 empty state”“切回已经在 streaming 的 tab”“loaded-conversation hydration 前的 stable state writeback”与“已经拿到一个新 conversation，并决定在当前 tab 直接打开它”这几条稳定 activation/open 路径。

## 公开接口

```typescript
export interface TabConversationActivationBridgeHost {
  getActiveTabId(): TabId | null;
  clearMessagesContainer(): void;
  resetTurnState(): void;
  updateModelSelectorDisplay(): void;
  scheduleSettledScrollToBottom(tabId: TabId | null): void;
}

export class TabConversationActivationBridge {
  applyEmptyTabActivation(tabId: TabId): void;
  applyLoadedConversationActivation(tabId: TabId | null, conversation: Conversation): void;
  applyStreamingConversationActivation(tabId: TabId, conversation: Conversation): void;
  openConversation(conversation: Conversation): void;
}
```

## 关键行为

- `applyEmptyTabActivation()` 继续复用 `TabConversationStateBridge.clearActiveConversation()` 和 `TabViewActivationBridge.applyEmptyActivationOutcome()`，bridge 自己只承接中间那段消息区清空 / turn reset 的 active-pane shell
- `applyLoadedConversationActivation()` 把 loaded-conversation hydration 前仍留在 `ConversationViewStateService` host surface 上的 active-conversation/session 写回，收束到与 streaming/empty 共用的 activation bridge，并继续复用 `TabConversationStateBridge.applyActiveConversation()`
- `applyStreamingConversationActivation()` 继续复用 `TabConversationStateBridge.applyActiveConversation()`、`commitConversationSyncBaseline()` 与 `TabViewActivationBridge.applyStreamingActivationOutcome()`，bridge 自己只承接 streaming fast path 上的 state writeback → baseline → UI outcome 串联
- `openConversation()` 继续保持原有的 same-conversation reopen 语义，但 indicator reset 判定已交给 `BackgroundTaskActivationIndicatorCoordinator.prepareOpenConversation()`
- active-tab conversation/session 写回与 sync baseline 提交继续分别复用 `TabConversationStateBridge.applyActiveConversation()` 和 `commitConversationSyncBaseline()`，bridge 自己不重新实现这些状态规则
- `OpenCodianView` 提供给本 bridge 的 active-tab lookup / shell reset / settled-scroll host shape 现在先经由 `TabActivationBridgeHostFactory` 统一派生，不再单独维护一份 `createTabConversationActivationBridgeHost()` 闭包
- streaming fast path 保持原有顺序：state writeback → baseline commit → `TabViewActivationBridge` 内的 selector/context identity → activation-side question/todo refresh → send button
- loaded-conversation activation writeback 保持原有语义：state writeback 时仍同步清空 revert state、session todo/status，并额外重置 background-task suppressed fingerprint，再把 hydration shell 留给 `ConversationTransitionBridge`
- current-tab open shell 保持原有顺序：background-task prepare → state writeback → 消息区清空/turn reset → baseline commit → selector/context identity → background-task runtime rebuild → `QuestionTodoActivationRefreshCoordinator.applyConversationActivation()` → indicator/context usage async refresh → settled scroll，其中 context usage identity / snapshot 已交给 `ActiveTabContextUsageCoordinator`
- 这样 `OpenCodianView` 不再直接内联 empty-tab activation、streaming activation 或 current-tab open 路径上的多段 host orchestration，只保留命令入口与 bridge 装配

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的消息容器 DOM、question/todo dock、model selector、context ring 与 background-task indicator 实现
- `TabConversationStateBridge` 继续负责 active-tab conversation/session 写回、empty-state clear 与 sync baseline；`TabViewActivationBridge` 继续负责 activation 预刷新和 empty-state outcome UI；`QuestionTodoActivationRefreshCoordinator` 继续负责 activation/open 侧的 question/todo dock 与 supplemental refresh 顺序；`BackgroundTaskActivationIndicatorCoordinator` 继续负责 open-side background-task indicator reset / rebuild / render trigger；`ActiveTabContextUsageCoordinator` 继续负责 open/activation 相邻的 context usage identity / snapshot writeback
- `TabConversationActivationBridge` 只组合这些稳定边界，承接当前活动 tab 的 empty-state activation、streaming fast-path activation、loaded-conversation activation state writeback，以及 current-tab new conversation open runtime/UI shell
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation 与 sync orchestration` ownership 迁移
