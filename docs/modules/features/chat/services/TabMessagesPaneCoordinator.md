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
}

export class TabMessagesPaneCoordinator<Runtime extends TabMessagesPaneRuntimeState> {
  constructor(
    host: TabMessagesPaneCoordinatorHost<Runtime>,
    scrollScheduler: SettledScrollScheduler,
  );
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
- `setActivePane()` 会统一切换 `is-active` class、写回 `messagesContainer`、恢复当前 turn body、重建 navigation sidebar，并在需要时通过 `SettledScrollScheduler` 安排 settled scroll
- `syncScrollMetrics()` 只负责 pane 级 near-bottom / passive measurement 和当前活动 pane 的 sidebar 可见性刷新
- layout 变化若发生在 hydration 期间，只累计 `pendingLayoutMutations` 并刷新 metrics；不会过早触发 settled auto-scroll
- `TabMessagesPaneRuntimeState` 新增 `hydrationDepth`：嵌套 hydration pass（如 conversation load 内的设置 rerender）共享 per-tab `isHydratingConversation` flag，只有最外层 end 可以清除它，否则会在 hydration 中途打开 sync deferral 窗口
- hydration 期间越过 programmatic guard 的实际 scroll event 会写入 `userScrollIntentDuringHydration`；因此用户明确滚到 `scrollTop = 0` 也不会被重建后的默认零位置吞掉
- pane 会在 `wheel`、`touchstart` 与可滚动 `keydown` 输入到达时先清除短时 `programmaticScrollGuardUntil`，再让后续真实 `scroll` 事件按用户意图处理；只有该 scroll event 才会在 hydration 中写入 `userScrollIntentDuringHydration`，输入本身不会误认领滚动。这些输入 listener 与 scroll listener 会随 pane dispose 一并移除
- `ensurePane()` 若发现同 tab 的缓存 pane 只因外层 shell 重建而从 DOM 断开，会把同一个 pane node 重新挂到当前 shell，不销毁或复制 runtime；active host 引用、stream 状态、listeners/observers 与 DOM-only 展开状态因此保持连续。真正结束 tab 生命周期仍统一走 `removePane()` / `clearPanes()` dispose
- `suppressNextLayoutAutoScroll()` 会给指定 tab runtime 打一次性标记，让下一次 active-pane layout observer 回调只刷新 metrics、不调度 settled scroll；用于 tool / thinking 等用户主动展开场景
- `removePane()` / `clearPanes()` 会统一取消 per-tab stream、清掉 signal sync 调度、断开 observers 并删除 DOM pane

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只保留 host wiring、`TabManager` / conversation bridge 入口，以及高层 scroll/business 判断
- pane DOM map 的主要 lifecycle ownership 已迁到 `TabMessagesPaneCoordinator`
- settled scroll 的 rAF 帧状态和取消逻辑由 `ScrollManager.SettledScrollScheduler` 拥有，coordinator 直接引用；不再通过宿主回调回退到 view
