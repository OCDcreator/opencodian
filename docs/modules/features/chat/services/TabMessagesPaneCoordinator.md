# TabMessagesPaneCoordinator

> **源码**: `src/features/chat/services/TabMessagesPaneCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`TabMessagesPaneCoordinator` 把 `OpenCodianView` 里原本分散的 tab messages pane surface 生命周期收束到一个较厚 owner：

- 为每个 tab 创建和缓存 messages pane DOM
- 处理 active pane 切换与 `messagesContainer` 写回
- 维护 pane scroll metrics、user scroll intent 和 hydration/layout 触发的 auto-scroll 调度
- 管理 `MutationObserver` / `ResizeObserver`、pane remove/clear cleanup，以及 per-tab stream cancel / signal-sync cleanup

它不负责 `TabManager` 的业务决策，也不负责 conversation hydration、message render 或 scroll snapshot 算法；这些边界仍分别留在 `OpenCodianView`、`Conversation*` runtime/service，以及 `ScrollManager.ts`。

## 公开接口

```typescript
export interface TabMessagesPaneCoordinatorHost<Runtime extends TabMessagesPaneRuntimeState> {
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainer(): HTMLElement | null;
  setMessagesContainer(messagesEl: HTMLElement | null): void;
  getActiveTabId(): TabId | null;
  createRuntimeState(): Runtime;
  applyChatScrollModeToMessagesEl(messagesEl: HTMLElement): void;
  resetTurnState(): void;
  restoreTurnStateFromActivePane(): void;
  rebuildNavigationSidebar(): void;
  destroyNavigationSidebar(): void;
  updateNavigationSidebarVisibility(): void;
  clearScheduledSignalConversationSync(tabId: TabId): void;
  shouldAutoScroll(tabId: TabId | null): boolean;
  scheduleSettledScrollToBottomIfNeeded(shouldScroll: boolean, tabId: TabId | null): void;
}

export class TabMessagesPaneCoordinator<Runtime extends TabMessagesPaneRuntimeState> {
  getPaneState(tabId: TabId | null): TabMessagesPaneState<Runtime> | null;
  getRuntimeState(tabId: TabId | null): Runtime | null;
  getMessagesEl(tabId: TabId | null): HTMLElement | null;
  applyScrollModeToPanes(): boolean;
  ensureRuntimeState(tabId: TabId | null): Runtime | null;
  ensurePane(tabId: TabId): TabMessagesPaneState<Runtime> | null;
  setActivePane(tabId: TabId): void;
  removePane(tabId: TabId): void;
  clearPanes(): void;
  syncScrollMetrics(tabId: TabId | null, messagesEl?: HTMLElement | null): boolean;
  scrollToBottom(tabId: TabId | null, options?: ScrollToBottomOptions): void;
  suppressNextLayoutAutoScroll(tabId: TabId | null): boolean;
}
```

## 关键行为

- `ensurePane()` 一次性组装 tab pane DOM、scroll listener、mutation/resize observers 和新 runtime，并保留同一个 pane state 供 view 其它 host seam 复用
- `setActivePane()` 会统一切换 `is-active` class、写回 `messagesContainer`、恢复当前 turn body、重建 navigation sidebar，并在需要时安排 settled scroll
- `syncScrollMetrics()` 只负责 pane 级 near-bottom / passive measurement 和当前活动 pane 的 sidebar 可见性刷新
- layout 变化若发生在 hydration 期间，只累计 `pendingLayoutMutations` 并刷新 metrics；不会过早触发 settled auto-scroll
- `suppressNextLayoutAutoScroll()` 会给指定 tab runtime 打一次性标记，让下一次 active-pane layout observer 回调只刷新 metrics、不调度 settled scroll；用于 tool / thinking 等用户主动展开场景
- `removePane()` / `clearPanes()` 会统一取消 per-tab stream、清掉 signal sync 调度、断开 observers 并删除 DOM pane

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留 host wiring、`TabManager` / conversation bridge 入口，以及高层 scroll/business 判断
- pane DOM map 的主要 lifecycle ownership 已迁到 `TabMessagesPaneCoordinator`
- `ScrollManager.ts` 继续保持纯 DOM/scroll helper；pane owner 只复用它的底层算法，不回退为新的 view 内联实现
