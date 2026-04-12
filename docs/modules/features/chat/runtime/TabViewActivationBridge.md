# TabViewActivationBridge

> **源码**: `src/features/chat/runtime/TabViewActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabViewActivationBridge` 把 `OpenCodianView` 中 tab 激活入口里剩余的 pane/UI 预刷新，以及 streaming / empty-tab 激活后的直接 UI outcome 刷新，收束成一个 dedicated bridge：它统一负责切换 active messages pane，并按既有顺序刷新 focus preview、question dock、session todo dock、selector/context usage identity 和 send button。

它不负责 conversation/session 写回、hydration 装载、消息区重渲，或向 server 拉取 full context usage；这些仍分别留给 `TabConversationStateBridge`、`ConversationViewStateService`、render host 与 context usage service。bridge 只处理已经决定要激活某个 tab 后必须同步的 view-facing UI writeback。

## 公开接口

```typescript
export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
  renderSessionTodoDock(tabId: TabId): void;
  updateModelSelectorDisplay(): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshTabSessionStatus(tabId: TabId, sessionId: string | null, options: { suppressErrors?: boolean }): Promise<SessionActivityStatus | null>;
  refreshPendingQuestionsForTab(tabId: TabId, sessionId: string | null): Promise<QuestionRequest[]>;
  refreshTabSessionTodos(tabId: TabId, sessionId: string | null, options: { suppressErrors?: boolean }): Promise<SessionTodo[]>;
  updateSendButtonState(): void;
}

export class TabViewActivationBridge {
  applyActivationPreflight(tabId: TabId): void;
  applyStreamingActivationOutcome(tabId: TabId, sessionId: string | null): void;
  applyEmptyActivationOutcome(tabId: TabId): void;
}
```

## 关键行为

- `applyActivationPreflight()` 保持原有 tab 激活预刷新顺序：先切换 pane，再刷新 focus preview、question dock、todo dock
- `applyStreamingActivationOutcome()` 保持 streaming fast-path 的后续刷新顺序：model selector → context usage identity → todo dock → question dock → status/questions/todos lazy refresh → send button
- `applyEmptyActivationOutcome()` 保持 empty-tab 清空后的后续刷新顺序：todo dock → question dock → model selector → context usage identity → send button
- `ConversationViewStateService.activateTab()` 现在只决定激活后走 streaming / hydration / empty-tab 哪条分支，不再直接持有这些 pane-level UI writeback
- 这样后续如果继续沿 P1 收紧 tab activation ownership，可以在不改动 hydrate 主链路的情况下扩展同一桥接边界

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 pane DOM 所有权，以及 focus/question/todo/selector/send-button 的具体渲染实现
- streaming 与 empty-tab activation 的 selector、context identity、dock 和 send-button 刷新顺序现在由本 bridge 统一编排，view 只负责 state writeback 与 host 装配
- `ConversationViewStateService` 只通过本 bridge 触发 activation preflight，streaming/empty 分支仍保持原来的 activation 决策
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移
