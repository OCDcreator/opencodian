# ConversationTabRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ConversationTabRuntimeCoordinator` 是 `OpenCodianView` 的 tab pane / runtime lifecycle owner。它不直接读取插件实例，也不渲染消息正文；而是通过 host seam 组合现有 tab 相关 owner：

- `TabMessagesPaneCoordinator`：messages pane DOM、pane runtime state、scroll metrics 与 pane cleanup
- `ConversationViewStateService`：tab activation 后的 conversation load / empty / streaming 分支
- `ConversationTabLifecycleRecoveryCoordinator`：close/delete 后的 active-tab recovery
- `ConversationRestoreBootstrapCoordinator`：first-open load、persisted restore 与 fallback conversation 创建
- `TabRuntimeStateBridge`：stream-like tab badge、background-task badge、attention 状态与 send-button writeback

这样 `OpenCodianView` 只保留 DOM/settings/state host wiring，tab manager、tab bar、active pane、persist/restore 与 stream-like state 的编排不再散落在 view 方法里。

## 公开接口

```typescript
export interface ConversationTabRuntimeCoordinatorHost {
  getMaxTabs(): number;
  getTabManager(): TabManager | null;
  setTabManager(tabManager: TabManager | null): void;
  getTabBar(): TabBar | null;
  setTabBar(tabBar: TabBar | null): void;
  getTabBarMountEl(): HTMLElement | null;
  setTabBarMountEl(element: HTMLElement | null): void;
  getChatContainerEl(): HTMLElement | null;
  getHeaderTabBarSlotEl(): HTMLElement | null;
  getBelowHeaderTabBarSlotEl(): HTMLElement | null;
  getOuterVerticalTabBarSlotEl(): HTMLElement | null;
  getInputTabBarSlotEl(): HTMLElement | null;
  getTabBarPosition(): TabBarPosition;
  getBelowHeaderTabBarLayout(): BelowHeaderTabBarLayout;
  setPersistedTabState(tabState: PersistedTabState): void;
  savePersistedTabState(options?: { flush?: boolean }): void;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(tabId: TabId | null, sessionId: string | null): SessionActivityStatus | null;
}

export interface ConversationTabRuntimeCoordinatorPorts {
  activateTab(tabId: TabId): Promise<void>;
  closeTabAndRecover(tabId: TabId): Promise<void>;
  initializeFirstTab(): Promise<void>;
  restorePersistedTabs(): TabId | null;
  syncTabStreamLikeState(tabId: TabId | null): void;
  syncActiveTabStreamLikeState(): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class ConversationTabRuntimeCoordinator<Runtime extends TabMessagesPaneRuntimeState> {
  initializeTabSystem(): void;
  destroyTabSystem(): void;
  initializeFirstTab(): Promise<void>;
  restorePersistedTabs(): TabId | null;
  resetTabManager(): void;
  renderTabBar(): void;
  persistTabState(options?: { flush?: boolean }): void;
  getActiveTabId(): TabId | null;
  getPaneState(tabId: TabId | null): TabMessagesPaneState<Runtime> | null;
  getRuntimeState(tabId?: TabId | null): Runtime | null;
  ensureRuntimeState(tabId?: TabId | null): Runtime | null;
  getActiveRuntimeState(): Runtime | null;
  ensureTabMessagesPane(tabId: TabId): TabMessagesPaneState<Runtime> | null;
  setActiveMessagesPane(tabId: TabId): void;
  removeTabMessagesPane(tabId: TabId): void;
  clearTabMessagesPanes(): void;
  syncPaneScrollMetrics(tabId: TabId | null, messagesEl?: HTMLElement | null): boolean;
  isActiveTabStreaming(): boolean;
  isTabForegroundBusy(tabId?: TabId | null): boolean;
  syncTabStreamLikeState(tabId: TabId | null): void;
  syncActiveTabStreamLikeState(): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  handleTabSwitch(tabId: TabId): Promise<void>;
  handleTabClose(tabId: TabId): Promise<void>;
  activateTab(tabId: TabId): Promise<void>;
  applyTabBarLayout(): void;
}
```

## 关键行为

- `initializeTabSystem()` 一次性创建 `TabBar`、`TabManager` 与 tab bar mount，并把 `TabManager.onChanged` 统一接到 `renderTabBar()` + `persistTabState()`
- `applyTabBarLayout()` 继续保留 header / below-header grid / below-header vertical / input slot 的原有 CSS class 与 render 顺序
- `persistTabState()` 只持久化 conversation id、title、model override 与 active index，并继续区分 scheduled save 与 `flush` immediate save
- `handleTabSwitch()` 先让 `TabManager` 切换 active tab，再转交 activation port；`handleTabClose()` 只转交 close/recovery port
- `isTabForegroundBusy()` 保持原有 gating：runtime streaming 优先，其次按 session todo/status 的 `busy` / `retry` 判定 foreground busy
- pane state、runtime state、active pane、pane cleanup 与 scroll metrics 都继续委托给 `TabMessagesPaneCoordinator`，不在本 coordinator 内复制 pane DOM map

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍定义完整 `TabRuntimeState` shape，并保留真实 DOM slots、settings、plugin save、session status 与 pane host wiring
- `ConversationTabRuntimeCoordinator` 只负责 tab runtime lifecycle 的编排，不接管 message render、send pipeline、opencode transport、question dock 或 todo runtime 语义
- `ConversationRestoreBootstrapCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationViewStateService` 继续拥有各自 conversation/recovery/load 细节；本模块只是把 tab-facing lifecycle 入口收束成单一 coordinator surface
