import type { PersistedTabState } from '../../../../src/core/types';
import {
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeCoordinatorHost,
  type ConversationTabRuntimeCoordinatorPorts,
  type ConversationTabRuntimeState,
  createConversationTabRuntimeCoordinatorHost,
  type TabBarMutableState,
  type TabRuntimeSettings,
} from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';
import type { TabMessagesPaneCoordinator } from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';
import {
  type TabBar,
  type TabId,
  TabManager,
} from '../../../../src/features/chat/tabs';

function createPaneCoordinator() {
  return {
    getPaneState: jest.fn(() => null),
    getRuntimeState: jest.fn(() => null),
    ensureRuntimeState: jest.fn(() => null),
    ensurePane: jest.fn(() => null),
    setActivePane: jest.fn(),
    removePane: jest.fn(),
    clearPanes: jest.fn(),
    syncScrollMetrics: jest.fn(() => true),
  } as unknown as jest.Mocked<TabMessagesPaneCoordinator<ConversationTabRuntimeState>>;
}

function createDisabledFixture() {
  let enableTabs = false;
  let tabBarPosition: 'input' | 'header' | 'below-header' = 'below-header';
  let belowHeaderTabBarLayout: 'grid' | 'vertical' = 'grid';
  let tabManager: TabManager | null = null;
  let tabBar: TabBar | null = null;
  let tabBarMountEl: HTMLElement | null = null;
  let persistedTabState: PersistedTabState = { tabs: [], activeTabIndex: 0 };
  const chatContainerEl = document.createElement('div');
  const headerTabBarSlotEl = document.createElement('div');
  const belowHeaderTabBarSlotEl = document.createElement('div');
  const outerVerticalTabBarSlotEl = document.createElement('div');
  const inputTabBarSlotEl = document.createElement('div');
  const host: ConversationTabRuntimeCoordinatorHost = {
    areTabsEnabled: jest.fn(() => enableTabs),
    getMaxTabs: jest.fn(() => 4),
    getTabManager: jest.fn(() => tabManager),
    setTabManager: jest.fn((next) => { tabManager = next; }),
    getTabBar: jest.fn(() => tabBar),
    setTabBar: jest.fn((next) => { tabBar = next; }),
    getTabBarMountEl: jest.fn(() => tabBarMountEl),
    setTabBarMountEl: jest.fn((el) => { tabBarMountEl = el; }),
    getChatContainerEl: jest.fn(() => chatContainerEl),
    getHeaderTabBarSlotEl: jest.fn(() => headerTabBarSlotEl),
    getBelowHeaderTabBarSlotEl: jest.fn(() => belowHeaderTabBarSlotEl),
    getOuterVerticalTabBarSlotEl: jest.fn(() => outerVerticalTabBarSlotEl),
    getInputTabBarSlotEl: jest.fn(() => inputTabBarSlotEl),
    getTabBarPosition: jest.fn(() => tabBarPosition),
    getBelowHeaderTabBarLayout: jest.fn(() => belowHeaderTabBarLayout),
    setPersistedTabState: jest.fn((state) => { persistedTabState = state; }),
    savePersistedTabState: jest.fn(),
    trimConversationFullMessageCache: jest.fn(),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? `${tabId}-session` : null)),
    getTabSessionStatus: jest.fn(() => null),
    getTabContextUsage: jest.fn(() => null),
  };
  const ports: jest.Mocked<ConversationTabRuntimeCoordinatorPorts> = {
    activateTab: jest.fn().mockResolvedValue(undefined),
    closeTabAndRecover: jest.fn().mockResolvedValue(undefined),
    initializeFirstTab: jest.fn().mockResolvedValue(undefined),
    restorePersistedTabs: jest.fn(() => null),
    syncTabStreamLikeState: jest.fn(),
    syncActiveTabStreamLikeState: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };

  return {
    chatContainerEl,
    coordinator: new ConversationTabRuntimeCoordinator(host, createPaneCoordinator(), ports),
    getPersistedTabState: () => persistedTabState,
    setBelowHeaderTabBarLayout: (layout: 'grid' | 'vertical') => { belowHeaderTabBarLayout = layout; },
    setEnableTabs: (next: boolean) => { enableTabs = next; },
    setTabBarPosition: (position: 'input' | 'header' | 'below-header') => { tabBarPosition = position; },
    headerTabBarSlotEl,
    belowHeaderTabBarSlotEl,
    outerVerticalTabBarSlotEl,
    inputTabBarSlotEl,
    getTabBarMountEl: () => tabBarMountEl,
    getTabManager: () => tabManager,
  };
}

function createHostFactorySource(settings: Partial<TabRuntimeSettings> = {}) {
  const tabBarState: TabBarMutableState = {
    tabManager: null,
    tabBar: null,
    tabBarMountEl: null,
  };
  return {
    tabBarState,
    settings: {
      enableTabs: true,
      maxTabs: 4,
      tabBarPosition: 'below-header' as const,
      belowHeaderTabBarLayout: 'grid' as const,
      ...settings,
    },
    plugin: {
      settings: {
        enableTabs: true,
        maxTabs: 4,
        tabBarPosition: 'below-header' as const,
        belowHeaderTabBarLayout: 'grid' as const,
        tabState: { tabs: [], activeTabIndex: 0 },
      },
      saveSettingsUiStateImmediately: jest.fn(),
      scheduleSettingsUiStateSave: jest.fn(),
      trimConversationFullMessageCache: jest.fn(),
    },
    view: {
      getChatContainerEl: jest.fn(() => document.createElement('div')),
      getHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getBelowHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getOuterVerticalTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getInputTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getSessionIdForTab: jest.fn((_tabId: TabId | null) => null),
      getTabSessionStatus: jest.fn(() => null),
    },
  };
}

describe('ConversationTabRuntimeCoordinator with tabs disabled', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the tab manager active but detaches tab-bar UI', () => {
    const fixture = createDisabledFixture();

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const tab = tabManager?.createTab({ id: 'conv-1', title: 'Conversation 1' });
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tab).not.toBeNull();
    expect(tabManager?.getActiveTab()?.conversationId).toBe('conv-1');
    expect(tabBarMountEl).not.toBeNull();
    expect(tabBarMountEl?.parentElement).toBeNull();
    expect(fixture.chatContainerEl.classList.contains('opencodian-container--tabs-disabled')).toBe(true);
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).toBeNull();
    expect(fixture.getPersistedTabState().tabs).toHaveLength(1);
  });

  it('shows a parent return breadcrumb for an active hidden child tab', () => {
    const fixture = createDisabledFixture();

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const parentTab = tabManager?.createTab({ id: 'conv-parent', title: 'Parent session' });
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: parentTab?.id },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).not.toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-parent-breadcrumb')).not.toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-parent-close')).not.toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).toBeNull();
  });

  it('keeps a close-only navigation mount for an active orphan hidden child tab', () => {
    const fixture = createDisabledFixture();

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: 'missing-parent' },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).toBe(fixture.belowHeaderTabBarSlotEl);
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-parent-breadcrumb')).toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-parent-close')).not.toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).toBeNull();
  });

  it('routes the disabled parent navigation through the configured header slot', () => {
    const fixture = createDisabledFixture();
    fixture.setTabBarPosition('header');

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const parentTab = tabManager?.createTab({ id: 'conv-parent', title: 'Parent session' });
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: parentTab?.id },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).toBe(fixture.headerTabBarSlotEl);
    expect(fixture.headerTabBarSlotEl.classList.contains('is-parent-only')).toBe(true);
    expect(fixture.belowHeaderTabBarSlotEl.classList.contains('is-parent-only')).toBe(false);
  });

  it('routes the disabled parent navigation through the configured input slot', () => {
    const fixture = createDisabledFixture();
    fixture.setTabBarPosition('input');

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const parentTab = tabManager?.createTab({ id: 'conv-parent', title: 'Parent session' });
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: parentTab?.id },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).toBe(fixture.inputTabBarSlotEl);
    expect(fixture.inputTabBarSlotEl.classList.contains('is-parent-only')).toBe(true);
    expect(fixture.belowHeaderTabBarSlotEl.classList.contains('is-parent-only')).toBe(false);
  });

  it('routes the disabled parent navigation through the configured vertical slot', () => {
    const fixture = createDisabledFixture();
    fixture.setTabBarPosition('below-header');
    fixture.setBelowHeaderTabBarLayout('vertical');

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const parentTab = tabManager?.createTab({ id: 'conv-parent', title: 'Parent session' });
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: parentTab?.id },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).toBe(fixture.outerVerticalTabBarSlotEl);
    expect(fixture.outerVerticalTabBarSlotEl.classList.contains('is-parent-only')).toBe(true);
    expect(fixture.belowHeaderTabBarSlotEl.classList.contains('is-parent-only')).toBe(false);
  });

  it('refreshes the active layout when tab enablement changes at runtime', () => {
    const fixture = createDisabledFixture();

    fixture.setEnableTabs(true);
    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const parentTab = tabManager?.createTab({ id: 'conv-parent', title: 'Parent session' });
    tabManager?.createTab(
      { id: 'conv-child', title: 'Child session' },
      { parentTabId: parentTab?.id },
    );
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tabBarMountEl?.parentElement).toBe(fixture.belowHeaderTabBarSlotEl);
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).not.toBeNull();

    fixture.setEnableTabs(false);
    fixture.coordinator.applyTabBarLayout();

    expect(tabBarMountEl?.parentElement).toBe(fixture.belowHeaderTabBarSlotEl);
    expect(fixture.chatContainerEl.classList.contains('opencodian-container--tabs-disabled')).toBe(true);
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-parent-breadcrumb')).not.toBeNull();
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).toBeNull();

    fixture.setEnableTabs(true);
    fixture.coordinator.applyTabBarLayout();

    expect(fixture.chatContainerEl.classList.contains('opencodian-container--tabs-disabled')).toBe(false);
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).not.toBeNull();
  });

  it('reads tab enablement from settings object', () => {
    const host = createConversationTabRuntimeCoordinatorHost(
      createHostFactorySource({ enableTabs: false }),
    );

    expect(host.areTabsEnabled()).toBe(false);
  });

  it('reads tab count and placement settings from the settings object', () => {
    const host = createConversationTabRuntimeCoordinatorHost(createHostFactorySource({
      maxTabs: 6,
      tabBarPosition: 'header',
    }));

    expect(host.getMaxTabs()).toBe(6);
    expect(host.getTabBarPosition()).toBe('header');
  });
});
