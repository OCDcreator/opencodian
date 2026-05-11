# ConversationTabRuntimeCoordinator

> **源码**: `src/features/chat/services/ConversationTabRuntimeCoordinator.ts`
> **状态**: [REVIEW]
> **最近更新**: Writable tab session lifecycle owner

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

export { createConversationTabRuntimeCoordinator as assembleConversationTabRuntime };

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
  getTabSessionPhase(tabId?: TabId | null): TabSessionPhase;
  isTabForegroundBusy(tabId?: TabId | null): boolean;
  queueFollowUpSend(tabId: TabId | null, request: PrepareMessageSendOptions): boolean;
  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null;
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
- `persistTabState()` 持久化 tab id、parent tab id、conversation id、title、model override 与 active index，并继续区分 scheduled save 与 `flush` immediate save
- `handleTabSwitch()` 先让 `TabManager` 切换 active tab，再转交 activation port；`handleTabClose()` 只转交 close/recovery port
- `TabSessionLifecycleState.ts` 提供 writable lifecycle reducer；`ConversationTabRuntimeCoordinator` 是 tab lifecycle transition owner，并在迁移期继续回写 `isStreaming`、`isConversationSyncInFlight` 等兼容字段。
- `getTabSessionPhase()` 按固定优先级派生当前 tab 的 phase：writable lifecycle foreground-busy phase > 同 session 其他 tab streaming > context compaction > server retry > server busy > idle/error/cancelled。同 session 其他 tab streaming 复用 `streaming` phase，保持与发送入口的 busy 语义兼容。
- `isTabForegroundBusy()` 现在消费 lifecycle-derived phase：`preparing`、`streaming`、`finalizing`、`syncing`、`compacting`、`server-busy`、`server-retrying` 都会阻塞 foreground send，防止 finalization / authoritative sync 写入窗口内再次发送。
- `transitionTabSessionLifecycle()` 是发送准备、stream start、local finalization、conversation sync lock、cancel/error recovery 等路径的统一写入入口；重复 phase/reason transition 不会制造新的 sequence。
- `queueFollowUpSend()` / `consumeQueuedFollowUpSend()` 在 tab runtime 上保存一个最小 send-intent：可见 prompt 内容、synthetic text parts、invocation intent 与目标 tab pin。队列只接受本 tab 正在 streaming 的 follow-up，因此 server-busy、retry 或同 session 其他 tab streaming 仍保持既有 blocked notice 语义；每个 tab 最多保留一个 queued follow-up。缺失 tab runtime 时不会创建队列或伪造消息。
- `suppressNextLayoutAutoScroll()` 是给 view/render 层的细粒度入口：当 tool / thinking 这类用户主动展开将要引发一次 pane layout 变化时，先把下一次 layout-driven auto-scroll 标记为应跳过
- pane state、runtime state、active pane、pane cleanup 与 scroll metrics 都继续委托给 `TabMessagesPaneCoordinator`，不在本 coordinator 内复制 pane DOM map

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 仍定义完整 `TabRuntimeState` shape，并保留真实 DOM slots、settings、plugin save、session status 与 pane host wiring
- `OpenCodianView` 通过 `createConversationTabRuntimeCoordinator(deps)` 一次性获得协调器实例，不再手动构造 `new ConversationTabRuntimeCoordinator(host, pane, ports)`
- `assembleConversationTabRuntime(deps)` 作为同义导出，供 `OpenCodianView` 的 `createConversationRuntimeWiring` 使用，避免在视图内直接调用 `createConversationTabRuntimeCoordinator`
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
2. **`TabSessionPhase` 只读派生**：phase 必须从既有 runtime、context usage 与 session status 计算；不能持久化、set/mutate，也不能成为新的可写 truth source。
3. **`TabSessionPhase` 优先级**：本 tab streaming > 同 session 其他 tab streaming > conversation sync in flight > context compaction > server retry > server busy > idle。调整 busy 语义前必须先更新 tests 与本模块文档。
4. **Follow-up queue 上限**：queued follow-up 是 stream-backed send-intent 暂存，不是 message truth source；每个 tab 只允许一个，不能扩展成 unbounded queue，也不能用于没有明确 stream completion 触发的 busy 状态。
5. **`initializeTabSystem()` 的原子性**：TabBar、TabManager 与 tab bar mount 在一次调用中创建，`TabManager.onChanged` 统一接到 `renderTabBar()` + `persistTabState()`；不能拆成多次独立初始化，否则中间状态会渲染不完整的 tab bar。
6. **`persistTabState()` 的 scheduled vs flush 区分**：常规切换用 scheduled save，关闭/销毁用 flush immediate save；不能统一用 scheduled，否则快速关闭 tab 可能丢失状态。
