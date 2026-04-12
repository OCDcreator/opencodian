# TabViewActivationBridge

> **源码**: `src/features/chat/runtime/TabViewActivationBridge.ts`
> **状态**: [REVIEW]

## 概述

`TabViewActivationBridge` 把 `OpenCodianView` 中 tab 激活入口里剩余的 pane/UI 预刷新写回收束成一个 dedicated bridge：它统一负责切换 active messages pane，并按既有顺序刷新 focus preview、question dock 与 session todo dock。

它不负责 conversation/session 写回、hydration 装载、消息区重渲，或 streaming/empty-tab 的后续 selector/send-button 刷新；这些仍分别留给 `TabConversationStateBridge`、`ConversationViewStateService` 与 `OpenCodianView` 的后续 activation 分支。

## 公开接口

```typescript
export interface TabViewActivationBridgeHost {
  setActiveMessagesPane(tabId: TabId): void;
  refreshActiveFocusContextPreview(): void;
  renderQuestionDock(): void;
  updateSessionTodoDockForTab(tabId: TabId): void;
}

export class TabViewActivationBridge {
  applyActivationPreflight(tabId: TabId): void;
}
```

## 关键行为

- `applyActivationPreflight()` 保持原有 tab 激活预刷新顺序：先切换 pane，再刷新 focus preview、question dock、todo dock
- `ConversationViewStateService.activateTab()` 现在只决定激活后走 streaming / hydration / empty-tab 哪条分支，不再直接持有这些 pane-level UI writeback
- 这样后续如果继续沿 P1 收紧 tab activation ownership，可以在不改动 hydrate 主链路的情况下扩展同一桥接边界

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 继续保留真实的 pane DOM 所有权，以及 focus/question/todo 的具体渲染实现
- `ConversationViewStateService` 只通过本 bridge 触发 activation preflight，不再暴露四个分散的 host 回调
- 这条边界推进的是 master plan 的 P1 `tab / pane / conversation activation` ownership 迁移
