import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  BelowHeaderTabBarLayout,
  PersistedTabState,
  TabBarPosition,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  TabBar,
  type TabBarLayoutMode,
  type TabId,
  TabManager,
} from '../tabs';
import {
  type TabMessagesPaneCoordinator,
  type TabMessagesPaneRuntimeState,
  type TabMessagesPaneState,
} from './TabMessagesPaneCoordinator';

export interface ConversationTabRuntimeState extends TabMessagesPaneRuntimeState {
  currentTurnBodyEl: HTMLElement | null;
  backgroundTaskIndicatorEl: HTMLElement | null;
  backgroundTaskInlineEls: Map<string, HTMLElement>;
  turnBodyByAnchorKey: Map<string, HTMLElement>;
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
        onTabClick: (tabId) => {
          void this.handleTabSwitch(tabId);
        },
        onTabClose: (tabId) => {
          void this.handleTabClose(tabId);
        },
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

  createTurn(
    tabId: TabId | null = this.getActiveTabId(),
  ): { turnEl: HTMLElement; headerEl: HTMLElement; bodyEl: HTMLElement } | null {
    const paneState = this.getPaneState(tabId);
    if (!paneState) {
      return null;
    }

    const turnEl = paneState.messagesEl.createDiv({ cls: 'opencodian-turn' });
    const headerEl = turnEl.createDiv({ cls: 'opencodian-turn-header' });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    paneState.runtime.currentTurnBodyEl = bodyEl;

    return { turnEl, headerEl, bodyEl };
  }

  ensureTurnBody(tabId: TabId | null = this.getActiveTabId()): HTMLElement | null {
    const paneState = this.getPaneState(tabId);
    if (!paneState) {
      return null;
    }

    if (paneState.runtime.currentTurnBodyEl?.isConnected) {
      return paneState.runtime.currentTurnBodyEl;
    }

    const turnEl = paneState.messagesEl.createDiv({
      cls: 'opencodian-turn opencodian-turn--assistant-only',
    });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    paneState.runtime.currentTurnBodyEl = bodyEl;

    return bodyEl;
  }

  isActiveTabStreaming(): boolean {
    return Boolean(this.getActiveRuntimeState()?.isStreaming);
  }

  isTabForegroundBusy(tabId: TabId | null = this.getActiveTabId()): boolean {
    const runtime = this.getRuntimeState(tabId);
    if (!runtime) {
      return false;
    }

    if (runtime.isStreaming) {
      return true;
    }

    const status = this.host.getTabSessionStatus(
      tabId,
      this.host.getSessionIdForTab(tabId),
    );
    return status?.type === 'busy' || status?.type === 'retry';
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
    const tabManager = this.host.getTabManager();
    if (!tabManager) {
      return;
    }

    const switched = tabManager.switchToTab(tabId);
    if (switched) {
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
    const inputTabBarSlotEl = this.host.getInputTabBarSlotEl();
    const chatContainerEl = this.host.getChatContainerEl();
    const tabBarMountEl = this.host.getTabBarMountEl();
    const headerTabBarSlotEl = this.host.getHeaderTabBarSlotEl();
    const belowHeaderTabBarSlotEl = this.host.getBelowHeaderTabBarSlotEl();
    const outerVerticalTabBarSlotEl = this.host.getOuterVerticalTabBarSlotEl();

    if (
      !chatContainerEl
      || !tabBarMountEl
      || !headerTabBarSlotEl
      || !belowHeaderTabBarSlotEl
      || !outerVerticalTabBarSlotEl
      || !inputTabBarSlotEl
    ) {
      return;
    }

    const isBelowHeader = this.host.getTabBarPosition() === 'below-header';
    const isVerticalBelowHeader =
      isBelowHeader && this.host.getBelowHeaderTabBarLayout() === 'vertical';
    const targetSlot = this.getTabBarTargetSlot({
      headerTabBarSlotEl,
      belowHeaderTabBarSlotEl,
      outerVerticalTabBarSlotEl,
      inputTabBarSlotEl,
      isBelowHeader,
      isVerticalBelowHeader,
    });

    if (tabBarMountEl.parentElement !== targetSlot) {
      tabBarMountEl.remove();
      targetSlot.appendChild(tabBarMountEl);
    }

    chatContainerEl.toggleClass(
      'opencodian-container--tab-pos-header',
      this.host.getTabBarPosition() === 'header',
    );
    chatContainerEl.toggleClass('opencodian-container--tab-pos-below-header', isBelowHeader);
    chatContainerEl.toggleClass(
      'opencodian-container--tab-pos-input',
      this.host.getTabBarPosition() === 'input',
    );
    chatContainerEl.toggleClass(
      'opencodian-container--tab-layout-grid',
      isBelowHeader && this.host.getBelowHeaderTabBarLayout() === 'grid',
    );
    chatContainerEl.toggleClass(
      'opencodian-container--tab-layout-vertical',
      isVerticalBelowHeader,
    );
    headerTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === headerTabBarSlotEl);
    belowHeaderTabBarSlotEl.classList.toggle(
      'is-active-slot',
      targetSlot === belowHeaderTabBarSlotEl,
    );
    outerVerticalTabBarSlotEl.classList.toggle(
      'is-active-slot',
      targetSlot === outerVerticalTabBarSlotEl,
    );
    inputTabBarSlotEl.classList.toggle('is-active-slot', targetSlot === inputTabBarSlotEl);
    this.renderTabBar();
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
