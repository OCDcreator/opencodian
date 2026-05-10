/* eslint-disable max-lines -- This owner intentionally keeps tab lifecycle, derived phase, and one-slot follow-up queue state together. */
import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  BelowHeaderTabBarLayout,
  PersistedTabState,
  TabBarPosition,
  TabContextState,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  TabBar,
  type TabBarLayoutMode,
  type TabId,
  TabManager,
} from '../tabs';
import type { PrepareMessageSendOptions } from './MessageSendPreparationService';
import {
  type TabMessagesPaneCoordinator,
  type TabMessagesPaneRuntimeState,
  type TabMessagesPaneState,
} from './TabMessagesPaneCoordinator';
import { deriveTabSessionPhase, isForegroundBusyTabSessionPhase, type TabSessionPhase } from './TabSessionPhase';
export interface ConversationTabRuntimeState extends TabMessagesPaneRuntimeState {
  currentTurnBodyEl: HTMLElement | null;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
  pendingEditedFiles: Set<string>;
  queuedFollowUpSend?: PrepareMessageSendOptions | null;
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
  getTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
  ): SessionActivityStatus | null;
  getTabContextUsage(tabId: TabId | null): TabContextState | null;
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

export interface ConversationTabRuntimeCoordinatorHostSource {
  tabBarState: TabBarMutableState;
  settings: TabRuntimeSettings;
  plugin: TabRuntimePluginSource;
  view: TabRuntimeViewSource;
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
  getTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
  ): SessionActivityStatus | null;
}

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
export function createConversationTabRuntimeCoordinatorHost(
  source: ConversationTabRuntimeCoordinatorHostSource,
): ConversationTabRuntimeCoordinatorHost {
  const { tabBarState, settings, plugin, view } = source;
  return {
    getMaxTabs: () => settings.maxTabs,
    getTabManager: () => tabBarState.tabManager,
    setTabManager: (tabManager) => { tabBarState.tabManager = tabManager; },
    getTabBar: () => tabBarState.tabBar,
    setTabBar: (tabBar) => { tabBarState.tabBar = tabBar; },
    getTabBarMountEl: () => tabBarState.tabBarMountEl,
    setTabBarMountEl: (element) => { tabBarState.tabBarMountEl = element; },
    getChatContainerEl: () => view.getChatContainerEl(),
    getHeaderTabBarSlotEl: () => view.getHeaderTabBarSlotEl(),
    getBelowHeaderTabBarSlotEl: () => view.getBelowHeaderTabBarSlotEl(),
    getOuterVerticalTabBarSlotEl: () => view.getOuterVerticalTabBarSlotEl(),
    getInputTabBarSlotEl: () => view.getInputTabBarSlotEl(),
    getTabBarPosition: () => settings.tabBarPosition,
    getBelowHeaderTabBarLayout: () => settings.belowHeaderTabBarLayout,
    setPersistedTabState: (tabState) => { plugin.settings.tabState = tabState; },
    savePersistedTabState: (options = {}) => {
      if (options.flush) {
        void plugin.saveSettingsUiStateImmediately();
        return;
      }
      plugin.scheduleSettingsUiStateSave();
    },
    getSessionIdForTab: (tabId) => view.getSessionIdForTab(tabId),
    getTabSessionStatus: (tabId, sessionId) =>
      view.getTabSessionStatus(tabId, sessionId),
    getTabContextUsage: (tabId) =>
      tabBarState.tabManager?.getTabContextUsage(tabId) ?? null,
  };
}

export interface ConversationTabRuntimeCoordinatorPortDependencies {
  loadRecoveryCoordinator: {
    activateTab(tabId: TabId): Promise<void>;
    initializeFirstTab(): Promise<void>;
    restorePersistedTabs(): TabId | null;
  };
  lifecycleRecoveryCoordinator: { closeTabAndRecover(tabId: TabId): Promise<void>; };
  runtimeStateBridge: {
    syncStreamLikeState(tabId: TabId | null): void;
    syncActiveStreamLikeState(): void;
    setNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  };
}

export interface ConversationTabRuntimeCoordinatorDependencies<
  Runtime extends ConversationTabRuntimeState = ConversationTabRuntimeState,
> extends ConversationTabRuntimeCoordinatorHostSource,
    ConversationTabRuntimeCoordinatorPortDependencies {
  paneCoordinator: TabMessagesPaneCoordinator<Runtime>;
}

export function createConversationTabRuntimeCoordinator<
  Runtime extends ConversationTabRuntimeState = ConversationTabRuntimeState,
>(deps: ConversationTabRuntimeCoordinatorDependencies<Runtime>): ConversationTabRuntimeCoordinator<Runtime> {
  const host = createConversationTabRuntimeCoordinatorHost(deps);
  return new ConversationTabRuntimeCoordinator(host, deps.paneCoordinator, {
    activateTab: (tabId) => deps.loadRecoveryCoordinator.activateTab(tabId),
    closeTabAndRecover: (tabId) =>
      deps.lifecycleRecoveryCoordinator.closeTabAndRecover(tabId),
    initializeFirstTab: () => deps.loadRecoveryCoordinator.initializeFirstTab(),
    restorePersistedTabs: () => deps.loadRecoveryCoordinator.restorePersistedTabs(),
    syncTabStreamLikeState: (tabId) => deps.runtimeStateBridge.syncStreamLikeState(tabId),
    syncActiveTabStreamLikeState: () => deps.runtimeStateBridge.syncActiveStreamLikeState(),
    setTabNeedsAttention: (tabId, needsAttention) =>
      deps.runtimeStateBridge.setNeedsAttention(tabId, needsAttention),
  });
}

export { createConversationTabRuntimeCoordinator as assembleConversationTabRuntime };

export class ConversationTabRuntimeCoordinator<
  Runtime extends ConversationTabRuntimeState = ConversationTabRuntimeState,
> {
  constructor(
    private readonly host: ConversationTabRuntimeCoordinatorHost,
    private readonly paneCoordinator: TabMessagesPaneCoordinator<Runtime>,
    private readonly ports: ConversationTabRuntimeCoordinatorPorts,
  ) {}
  initializeTabSystem(): void {
    if (!this.host.getChatContainerEl()) {
      return;
    }
    const tabBarMountEl = document.createElement('div');
    tabBarMountEl.className = 'opencodian-tab-bar-mount';
    this.host.setTabBarMountEl(tabBarMountEl);
    this.host.setTabBar(
      new TabBar(tabBarMountEl, {
        onTabClick: (tabId) => { void this.handleTabSwitch(tabId); },
        onTabClose: (tabId) => { void this.handleTabClose(tabId); },
      }),
    );
    this.host.setTabManager(this.createTabManager());
    this.applyTabBarLayout();
  }
  destroyTabSystem(): void {
    this.clearTabMessagesPanes();
    this.host.getTabBar()?.destroy();
    this.host.setTabBar(null);
    this.host.setTabBarMountEl(null);
    this.host.setTabManager(null);
  }
  async initializeFirstTab(): Promise<void> {
    await this.ports.initializeFirstTab();
  }
  restorePersistedTabs(): TabId | null {
    return this.ports.restorePersistedTabs();
  }
  resetTabManager(): void {
    this.host.setTabManager(this.createTabManager());
    this.renderTabBar();
  }
  renderTabBar(): void {
    const tabBar = this.host.getTabBar();
    const tabManager = this.host.getTabManager();
    if (!tabBar || !tabManager) {
      return;
    }
    tabBar.render(tabManager.getTabBarItems(), this.getTabBarLayoutMode());
  }
  persistTabState(options: { flush?: boolean } = {}): void {
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }
    const tabs = tabManager.getAllTabs();
    const activeTabId = tabManager.getActiveTab()?.id ?? null;
    const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
    this.host.setPersistedTabState({
      tabs: tabs.map((tab) => ({
        conversationId: tab.conversationId,
        title: tab.title,
        modelOverride: tab.modelOverride,
      })),
      activeTabIndex,
    });
    this.host.savePersistedTabState(options);
  }
  getActiveTabId(): TabId | null {
    return this.host.getTabManager()?.getActiveTab()?.id ?? null;
  }
  getPaneState(tabId: TabId | null): TabMessagesPaneState<Runtime> | null {
    return this.paneCoordinator.getPaneState(tabId);
  }
  getRuntimeState(tabId: TabId | null = this.getActiveTabId()): Runtime | null {
    return this.paneCoordinator.getRuntimeState(tabId);
  }
  ensureRuntimeState(tabId: TabId | null = this.getActiveTabId()): Runtime | null {
    return this.paneCoordinator.ensureRuntimeState(tabId);
  }
  getActiveRuntimeState(): Runtime | null {
    return this.getRuntimeState(this.getActiveTabId());
  }
  ensureTabMessagesPane(tabId: TabId): TabMessagesPaneState<Runtime> | null {
    return this.paneCoordinator.ensurePane(tabId);
  }
  setActiveMessagesPane(tabId: TabId): void {
    this.paneCoordinator.setActivePane(tabId);
  }
  removeTabMessagesPane(tabId: TabId): void {
    this.paneCoordinator.removePane(tabId);
  }
  clearTabMessagesPanes(): void {
    this.paneCoordinator.clearPanes();
  }
  syncPaneScrollMetrics(
    tabId: TabId | null,
    messagesEl: HTMLElement | null = this.getPaneState(tabId)?.messagesEl ?? null,
  ): boolean {
    return this.paneCoordinator.syncScrollMetrics(tabId, messagesEl);
  }
  suppressNextLayoutAutoScroll(tabId: TabId | null = this.getActiveTabId()): boolean {
    return this.paneCoordinator.suppressNextLayoutAutoScroll(tabId);
  }
  resetTurnState(tabId: TabId | null = this.getActiveTabId()): void {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return;
    }
    runtime.currentTurnBodyEl = null;
    runtime.backgroundTaskIndicatorEl = null;
    runtime.turnBodyByAnchorKey.clear();
    runtime.backgroundTaskInlineEls.clear();
  }
  restoreTurnStateFromPane(tabId: TabId | null = this.getActiveTabId()): void {
    const paneState = this.getPaneState(tabId);
    if (!paneState) {
      this.resetTurnState(tabId);
      return;
    }
    const turnBodies = Array.from(paneState.messagesEl.querySelectorAll('.opencodian-turn-body'));
    paneState.runtime.currentTurnBodyEl =
      (turnBodies[turnBodies.length - 1] as HTMLElement | undefined) ?? null;
    paneState.runtime.backgroundTaskIndicatorEl = null;
  }
  beginConversationHydration(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return false;
    }
    runtime.isHydratingConversation = true;
    runtime.pendingLayoutMutations = 0;
    return true;
  }
  recordHydrationLayoutMutation(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime?.isHydratingConversation) {
      return false;
    }
    runtime.pendingLayoutMutations += 1;
    return true;
  }
  endConversationHydration(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return false;
    }
    runtime.isHydratingConversation = false;
    const had = runtime.pendingLayoutMutations > 0;
    runtime.pendingLayoutMutations = 0;
    return had;
  }
  setAutoScrollEnabled(tabId: TabId | null, enabled: boolean): void {
    const runtime = this.getRuntimeState(tabId);
    if (runtime) {
      runtime.autoScrollEnabled = enabled;
    }
  }
  setStreaming(tabId: TabId | null, isStreaming: boolean): void {
    const runtime = this.getRuntimeState(tabId);
    if (runtime) {
      runtime.isStreaming = isStreaming;
    }
  }
  clearPendingEditedFiles(tabId: TabId | null): void {
    this.getRuntimeState(tabId)?.pendingEditedFiles.clear();
  }
  queueFollowUpSend(tabId: TabId | null, request: PrepareMessageSendOptions): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime?.isStreaming || runtime.queuedFollowUpSend) {
      return false;
    }
    runtime.queuedFollowUpSend = { ...request, ...(request.syntheticTextParts ? { syntheticTextParts: [...request.syntheticTextParts] } : {}) };
    return true;
  }
  consumeQueuedFollowUpSend(tabId: TabId | null): PrepareMessageSendOptions | null {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime?.queuedFollowUpSend) {
      return null;
    }
    const queued = runtime.queuedFollowUpSend;
    runtime.queuedFollowUpSend = null;
    return queued;
  }
  updateConversationSyncRuntime(
    tabId: TabId | null,
    update: { inFlight?: boolean; fingerprint?: string | null },
  ): void {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) return;
    if (update.inFlight !== undefined) runtime.isConversationSyncInFlight = update.inFlight;
    if ('fingerprint' in update) runtime.lastConversationSyncFingerprint = update.fingerprint ?? null;
  }
  registerTurnBodyAnchor(tabId: TabId | null, anchorKey: string, bodyEl: HTMLElement): void {
    this.getRuntimeState(tabId)?.turnBodyByAnchorKey.set(anchorKey, bodyEl);
  }
  rekeyTurnBodyAnchor(
    tabId: TabId | null,
    previousAnchorKey: string,
    nextAnchorKey: string,
  ): boolean {
    const runtime = this.getRuntimeState(tabId);
    const bodyEl = runtime?.turnBodyByAnchorKey.get(previousAnchorKey);
    if (!runtime || !bodyEl) return false;
    runtime.turnBodyByAnchorKey.delete(previousAnchorKey);
    runtime.turnBodyByAnchorKey.set(nextAnchorKey, bodyEl);
    return true;
  }

  createTurn(
    tabId: TabId | null = this.getActiveTabId(),
  ): { turnEl: HTMLElement; headerEl: HTMLElement; bodyEl: HTMLElement } | null {
    const paneState = this.getPaneState(tabId);
    if (!paneState) return null;
    const turnEl = paneState.messagesEl.createDiv({ cls: 'opencodian-turn' });
    const headerEl = turnEl.createDiv({ cls: 'opencodian-turn-header' });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });
    paneState.runtime.currentTurnBodyEl = bodyEl;
    return { turnEl, headerEl, bodyEl };
  }
  ensureTurnBody(tabId: TabId | null = this.getActiveTabId()): HTMLElement | null {
    const paneState = this.getPaneState(tabId);
    if (!paneState) return null;
    if (paneState.runtime.currentTurnBodyEl?.isConnected) return paneState.runtime.currentTurnBodyEl;
    const turnEl = paneState.messagesEl.createDiv({ cls: 'opencodian-turn opencodian-turn--assistant-only' });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });
    paneState.runtime.currentTurnBodyEl = bodyEl;
    return bodyEl;
  }

  isActiveTabStreaming(): boolean { return Boolean(this.getActiveRuntimeState()?.isStreaming); }
  getTabSessionPhase(tabId: TabId | null = this.getActiveTabId()): TabSessionPhase {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) return 'idle';
    const sameSessionStreaming = this.isSameSessionStreamingInAnotherTab(tabId);
    if (runtime.isStreaming || sameSessionStreaming) return deriveTabSessionPhase({ isStreaming: runtime.isStreaming, isSameSessionStreamingInAnotherTab: sameSessionStreaming });
    if (runtime.isConversationSyncInFlight) return deriveTabSessionPhase({ isConversationSyncInFlight: true });
    if (typeof this.host.getTabContextUsage(tabId)?.compactingAt === 'number') return deriveTabSessionPhase({ isContextCompacting: true });
    const status = this.host.getTabSessionStatus(tabId, this.host.getSessionIdForTab(tabId));
    return deriveTabSessionPhase({ sessionStatus: status });
  }
  isTabForegroundBusy(tabId: TabId | null = this.getActiveTabId()): boolean { return isForegroundBusyTabSessionPhase(this.getTabSessionPhase(tabId)); }

  private isSameSessionStreamingInAnotherTab(tabId: TabId | null): boolean {
    const targetSessionId = this.host.getSessionIdForTab(tabId);
    return Boolean(tabId && targetSessionId && this.host.getTabManager()?.getAllTabs().some((tab) => tab.id !== tabId
      && this.getRuntimeState(tab.id)?.isStreaming
      && this.host.getSessionIdForTab(tab.id) === targetSessionId));
  }

  syncTabStreamLikeState(tabId: TabId | null): void {
    this.ports.syncTabStreamLikeState(tabId);
  }
  syncActiveTabStreamLikeState(): void {
    this.ports.syncActiveTabStreamLikeState();
  }
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void {
    this.ports.setTabNeedsAttention(tabId, needsAttention);
  }

  async handleTabSwitch(tabId: TabId): Promise<void> {
    if (this.host.getTabManager()?.switchToTab(tabId)) {
      await this.ports.activateTab(tabId);
    }
  }
  async handleTabClose(tabId: TabId): Promise<void> {
    await this.ports.closeTabAndRecover(tabId);
  }
  async activateTab(tabId: TabId): Promise<void> {
    await this.ports.activateTab(tabId);
  }

  applyTabBarLayout(): void {
    const slots = this.collectTabBarSlots();
    if (!slots) return;
    const { chatContainerEl, tabBarMountEl, positionSlots } = slots;
    const pos = this.host.getTabBarPosition();
    const isBelowHeader = pos === 'below-header';
    const isVerticalBelowHeader = isBelowHeader && this.host.getBelowHeaderTabBarLayout() === 'vertical';
    const targetSlot = this.getTabBarTargetSlot({ ...positionSlots, isBelowHeader, isVerticalBelowHeader });
    if (tabBarMountEl.parentElement !== targetSlot) {
      tabBarMountEl.remove();
      targetSlot.appendChild(tabBarMountEl);
    }
    this.applyTabBarCssClasses(chatContainerEl, isBelowHeader, isVerticalBelowHeader);
    this.applySlotActiveClasses(targetSlot, positionSlots);
    this.renderTabBar();
  }

  private collectTabBarSlots() {
    const chatContainerEl = this.host.getChatContainerEl();
    const tabBarMountEl = this.host.getTabBarMountEl();
    const headerTabBarSlotEl = this.host.getHeaderTabBarSlotEl();
    const belowHeaderTabBarSlotEl = this.host.getBelowHeaderTabBarSlotEl();
    const outerVerticalTabBarSlotEl = this.host.getOuterVerticalTabBarSlotEl();
    const inputTabBarSlotEl = this.host.getInputTabBarSlotEl();
    if (
      !chatContainerEl || !tabBarMountEl || !headerTabBarSlotEl
      || !belowHeaderTabBarSlotEl || !outerVerticalTabBarSlotEl || !inputTabBarSlotEl
    ) return null;
    const positionSlots = { headerTabBarSlotEl, belowHeaderTabBarSlotEl, outerVerticalTabBarSlotEl, inputTabBarSlotEl };
    return { chatContainerEl, tabBarMountEl, positionSlots };
  }

  private applyTabBarCssClasses(
    chatContainerEl: HTMLElement,
    isBelowHeader: boolean,
    isVerticalBelowHeader: boolean,
  ): void {
    const pos = this.host.getTabBarPosition();
    const layout = this.host.getBelowHeaderTabBarLayout();
    chatContainerEl.toggleClass('opencodian-container--tab-pos-header', pos === 'header');
    chatContainerEl.toggleClass('opencodian-container--tab-pos-below-header', isBelowHeader);
    chatContainerEl.toggleClass('opencodian-container--tab-pos-input', pos === 'input');
    chatContainerEl.toggleClass('opencodian-container--tab-layout-grid', isBelowHeader && layout === 'grid');
    chatContainerEl.toggleClass('opencodian-container--tab-layout-vertical', isVerticalBelowHeader);
  }

  private applySlotActiveClasses(
    targetSlot: HTMLElement,
    slots: {
      headerTabBarSlotEl: HTMLElement;
      belowHeaderTabBarSlotEl: HTMLElement;
      outerVerticalTabBarSlotEl: HTMLElement;
      inputTabBarSlotEl: HTMLElement;
    },
  ): void {
    slots.headerTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === slots.headerTabBarSlotEl);
    slots.belowHeaderTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === slots.belowHeaderTabBarSlotEl);
    slots.outerVerticalTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === slots.outerVerticalTabBarSlotEl);
    slots.inputTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === slots.inputTabBarSlotEl);
  }

  private createTabManager(): TabManager {
    return new TabManager(t('chat.tab.new'), {
      getMaxTabs: () => this.host.getMaxTabs(),
      onChanged: () => {
        this.renderTabBar();
        this.persistTabState();
      },
    });
  }

  private getTabBarLayoutMode(): TabBarLayoutMode {
    if (this.host.getTabBarPosition() === 'header') {
      return 'header';
    }
    if (this.host.getTabBarPosition() === 'below-header') {
      return this.host.getBelowHeaderTabBarLayout() === 'vertical'
        ? 'below-header-vertical'
        : 'below-header-grid';
    }
    return 'input';
  }
  private getTabBarTargetSlot(options: {
    headerTabBarSlotEl: HTMLElement;
    belowHeaderTabBarSlotEl: HTMLElement;
    outerVerticalTabBarSlotEl: HTMLElement;
    inputTabBarSlotEl: HTMLElement;
    isBelowHeader: boolean;
    isVerticalBelowHeader: boolean;
  }): HTMLElement {
    if (this.host.getTabBarPosition() === 'header') {
      return options.headerTabBarSlotEl;
    }
    if (options.isVerticalBelowHeader) {
      return options.outerVerticalTabBarSlotEl;
    }
    return options.isBelowHeader
      ? options.belowHeaderTabBarSlotEl
      : options.inputTabBarSlotEl;
  }
}
