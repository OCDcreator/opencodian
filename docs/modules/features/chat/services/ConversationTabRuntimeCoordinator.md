# ConversationTabRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
> **状态**: [REVIEW]
> **最近更新**: lint compaction (max-lines 500 gate)

## 概述

`ConversationTabRuntimeCoordinator` 是 `OpenCodianView` 的 tab pane / runtime lifecycle owner。它不直接读取插件实例，也不渲染消息正文；而是通过 host seam 组合现有 tab 相关 owner：

- `TabMessagesPaneCoordinator`：messages pane DOM、pane runtime state、scroll metrics 与 pane cleanup
- `ConversationViewStateService`：tab activation 後的 conversation load / empty / streaming 分支
- `ConversationTabLifecycleRecoveryCoordinator`：close/delete 後的 active-tab recovery
- `ConversationLoadRecoveryCoordinator`：first-open load、persisted restore 與 fallback conversation 創建
- `TabRuntimeStateBridge`：stream-like tab badge、background-task badge、attention 狀態與 send-button writeback

host 組裝已通過 `createConversationTabRuntimeCoordinatorHost(source)` 工廠函數集中到此文件。工廠接受 `ConversationTabRuntimeCoordinatorHostSource`（含 `plugin`、`view`、`tabBarState`、`settings`），內部分解 `plugin` 的持久化方法和 `view` 的 DOM 存取器與 session 查詢方法，生成完整的 `ConversationTabRuntimeCoordinatorHost`。view 通過 `createConversationTabRuntimeCoordinator(deps)` 頂層工廠一次性獲得完整協調器實例——只需傳入 `plugin: this.plugin` 和 `view: this` 兩個直接引用，無需在調用點構建嵌套回調子對象。

## 公開接口

```typescript
export interface TabBarMutableState {
  tabManager: TabManager | null;
  tabBar: TabBar | null;
  tabBarMountEl: HTMLElement | null;
}

export interface TabRuntimeSettings {
  maxTabs: number;
  tabBarPosition: TabBarPosition;
  belowHeaderTabBarLayout: BelowHeaderTabBarLayout;
}

export interface TabRuntimePluginSource {
  settings: TabRuntimeSettings & { tabState: PersistedTabState };
  saveSettingsUiStateImmediately(): Promise<void>;
  scheduleSettingsUiStateSave(): void;
}

export interface TabRuntimeViewSource {
  getChatContainerEl(): HTMLElement | null;
  getHeaderTabBarSlotEl(): HTMLElement | null;
  getBelowHeaderTabBarSlotEl(): HTMLElement | null;
  getOuterVerticalTabBarSlotEl(): HTMLElement | null;
  getInputTabBarSlotEl(): HTMLElement | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getTabSessionStatus(tabId: TabId | null, sessionId: string | null): SessionActivityStatus | null;
}

export interface TabRuntimeSettings {
  maxTabs: number;
  tabBarPosition: TabBarPosition;
  belowHeaderTabBarLayout: BelowHeaderTabBarLayout;
}

export interface TabRuntimePersistence {
  setPersistedTabState(tabState: PersistedTabState): void;
  saveImmediately(): void;
  scheduleSave(): void;
}

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
  getTabContextUsage(tabId: TabId | null): TabContextState | null;
}

export interface ConversationTabRuntimeCoordinatorHostSource {
  tabBarState: TabBarMutableState;
  settings: TabRuntimeSettings;
  plugin: TabRuntimePluginSource;
  view: TabRuntimeViewSource;
}

export function createConversationTabRuntimeCoordinatorHost(
  source: ConversationTabRuntimeCoordinatorHostSource,
): ConversationTabRuntimeCoordinatorHost;

export interface ConversationTabRuntimeCoordinatorPortDependencies {
  loadRecoveryCoordinator: { activateTab, initializeFirstTab, restorePersistedTabs };
  lifecycleRecoveryCoordinator: { closeTabAndRecover };
  runtimeStateBridge: { syncStreamLikeState, syncActiveStreamLikeState, setNeedsAttention };
}

export interface ConversationTabRuntimeCoordinatorDependencies<Runtime>
  extends ConversationTabRuntimeCoordinatorHostSource,
    ConversationTabRuntimeCoordinatorPortDependencies {
  paneCoordinator: TabMessagesPaneCoordinator<Runtime>;
}

export function createConversationTabRuntimeCoordinator<Runtime>(
  deps: ConversationTabRuntimeCoordinatorDependencies<Runtime>,
): ConversationTabRuntimeCoordinator<Runtime>;

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
  suppressNextLayoutAutoScroll(tabId?: TabId | null): boolean;
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
- `isTabForegroundBusy()` 先检查 `getTabContextUsage(tabId).compactingAt`——若为 number（正在进行 compaction），直接返回 busy；否则回落到原有 gating：runtime streaming 优先，其次按 session todo/status 的 `busy` / `retry` 判定 foreground busy
- `suppressNextLayoutAutoScroll()` 是给 view/render 层的细粒度入口：当 tool / thinking 这类用户主动展开将要引发一次 pane layout 变化时，先把下一次 layout-driven auto-scroll 标记为应跳过
- pane state、runtime state、active pane、pane cleanup 与 scroll metrics 都继续委托给 `TabMessagesPaneCoordinator`，不在本 coordinator 内复制 pane DOM map

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍定义完整 `TabRuntimeState` shape，并保留真实 DOM slots、settings、plugin save、session status 与 pane host wiring
- `OpenCodianView` 通过 `createConversationTabRuntimeCoordinator(deps)` 一次性获得协调器实例，不再手动构造 `new ConversationTabRuntimeCoordinator(host, pane, ports)`
- `TabBarMutableState` 是 view 与 coordinator 之间的共享可变状态桥接；view 的 `tabManager`、`tabBar`、`tabBarMountEl` 通过 getter/setter 适配器写入该对象
- `ConversationTabRuntimeCoordinator` 只负责 tab runtime lifecycle 的编排，不接管 message render、send pipeline、opencode transport、question dock 或 todo runtime 语义
- `ConversationLoadRecoveryCoordinator`、`ConversationTabLifecycleRecoveryCoordinator` 与 `ConversationViewStateService` 继续拥有各自 conversation/recovery/load 细节；本模块只是把 tab-facing lifecycle 入口收束成单一 coordinator surface

## 注意事项

### 优先扩展的相邻模块

| 功能类型 | 优先扩展 |
|----------|----------|
| Tab pane DOM / scroll / pane state | `TabMessagesPaneCoordinator` |
| 会话加载 / 恢复 / fallback | `ConversationLoadRecoveryCoordinator` |
| Close/delete 后的 active-tab recovery | `ConversationTabLifecycleRecoveryCoordinator` |
| Tab activation 后的 load/empty/streaming 分支 | `ConversationViewStateService` |
| Tab badge / background-task badge / attention | `TabRuntimeStateBridge` |
| Message render | `ConversationRenderService` |
| Send pipeline | `SendPipelineRuntime` / `MessageSendPreparationService` |

### 不可移除的关键行为

1. **Per-tab streaming 隔离**：每个 tab 拥有独立的 runtime state 和 pane state；不能退化为全局单一 stream 状态，否则并发 tab 会互相干扰。
2. **`isTabForegroundBusy()` 的 compaction 优先检查**：先检查 `compactingAt`，再回落到 streaming/session busy；这个优先级不能颠倒，否则 compaction 期间用户可能触发冲突操作。
3. **`initializeTabSystem()` 的原子性**：TabBar、TabManager 与 tab bar mount 在一次调用中创建，`TabManager.onChanged` 统一接到 `renderTabBar()` + `persistTabState()`；不能拆成多次独立初始化，否则中间状态会渲染不完整的 tab bar。
4. **`persistTabState()` 的 scheduled vs flush 区分**：常规切换用 scheduled save，关闭/销毁用 flush immediate save；不能统一用 scheduled，否则快速关闭 tab 可能丢失状态。
