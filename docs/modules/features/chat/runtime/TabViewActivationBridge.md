# TabViewActivationBridge

> **源码**: `src/features/chat/runtime/TabViewActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabViewActivationBridge` 把 `OpenCodianView` 中 tab 激活入口里剩余的 pane/UI 预刷新，以及 streaming / empty-tab 激活后的直接 UI outcome 刷新，继续扩展为 loaded-conversation 的 post-render / hydration-tail 轻量 UI writeback bridge：它统一负责切换 active messages pane，并按既有顺序刷新 focus preview、question dock、session todo dock、background-task indicator、composer layout、selector/context usage identity 和 send button。

它不负责 conversation/session 写回、hydration 装载、消息区重渲，也不再直接持有 status / pending question / todo 三段 lazy refresh；这些仍分别留给 `TabConversationStateBridge`、`ConversationViewStateService`、render host 与 `QuestionTodoStatusRefreshCoordinator`。bridge 只处理已经决定要激活某个 tab 后必须同步的 view-facing UI writeback，其中 loaded-conversation 的 post-render background-task indicator + dock 刷新，以及 hydration 尾段的 layout / selector / context usage identity / context usage snapshot fetch 都收敛在同一边界内，但不接管 hydrate 主流程。

## 公开接口

```typescript
export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  scheduleComposerLayoutSync(): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  applyActivationPreflight(tabId: TabId): void;
  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void;
  applyEmptyActivationOutcome(tabId: TabId): void;
  applyLoadedConversationPostRenderOutcome(tabId: TabId | null, sessionId: string | null): Promise<void>;
  applyLoadedConversationHydrationTail(): Promise<void>;
}
```

## 关键行为

- `applyActivationPreflight()` 保持原有 tab 激活预刷新顺序：先切换 pane，再刷新 focus preview、question dock、todo dock
- `applyStreamingActivationOutcome()` 保持 streaming fast-path 的后续刷新顺序：model selector → context usage identity → todo dock → question dock → `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()` → send button
- `applyEmptyActivationOutcome()` 保持 empty-tab 清空后的后续刷新顺序：todo dock → question dock → model selector → context usage identity → send button
- `applyLoadedConversationPostRenderOutcome()` 接管 loaded conversation 在消息重渲后、scroll restore 之前的 activation/render outcome：先刷新 background-task indicator，再按既有顺序刷新 todo dock → question dock → `QuestionTodoStatusRefreshCoordinator.refreshAfterActivation()`
- `applyLoadedConversationHydrationTail()` 接管 loaded conversation 在 scroll restore 之后的 hydration 尾段 UI 顺序：composer layout sync → model selector → context usage identity → context usage snapshot fetch
- `ConversationViewStateService.activateTab()` 现在只决定激活后走 streaming / hydration / empty-tab 哪条分支，不再直接持有这些 pane-level UI writeback
- `ConversationViewStateService.loadConversation()` 继续保留 hydrate 主链路和消息区 scroll restore，但不再持有 loaded-conversation 的 background-task indicator / dock post-render outcome，也不再持有 composer/model/context usage 这段 hydration 尾部 writeback；status/question/todo lazy refresh 由 `QuestionTodoStatusRefreshCoordinator` 统一触发
- 这样后续如果继续沿 P1 收紧 tab activation ownership，可以在不改动 hydrate 主链路的情况下扩展同一桥接边界

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 pane DOM 所有权，以及 focus/question/todo/selector/send-button 的具体渲染实现
- streaming 与 empty-tab activation 的 selector、context identity、dock 和 send-button 刷新顺序，以及 loaded-conversation 的 post-render background-task indicator / dock outcome 与 hydration 尾段的 composer/model/context usage 写回，现在都由本 bridge 统一编排；status/question/todo lazy refresh 顺序则交给 `QuestionTodoStatusRefreshCoordinator`
- `ConversationViewStateService` 只通过本 bridge 触发 activation preflight、loaded-conversation post-render outcome 与 hydration tail UI 刷新，streaming/empty 分支仍保持原来的 activation 决策
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移
