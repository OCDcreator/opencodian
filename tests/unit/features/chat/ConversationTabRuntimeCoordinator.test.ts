import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { PersistedTabState, TabContextState } from '../../../../src/core/types';
import {
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeCoordinatorHost,
  type ConversationTabRuntimeCoordinatorHostSource,
  type ConversationTabRuntimeCoordinatorPorts,
  type ConversationTabRuntimeState,
  createConversationTabRuntimeCoordinator,
  createConversationTabRuntimeCoordinatorHost,
  type TabBarMutableState,
  type TabRuntimePluginSource,
  type TabRuntimeSettings,
  type TabRuntimeViewSource,
} from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';
import {
  type TabMessagesPaneCoordinator,
  type TabMessagesPaneState,
} from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';
import { type TabBar, type TabId,TabManager } from '../../../../src/features/chat/tabs';

interface TestRuntimeState extends ConversationTabRuntimeState {
  label?: string;
}

function createRuntimeState(overrides: Partial<TestRuntimeState> = {}): TestRuntimeState {
  return {
    autoScrollEnabled: true,
    isNearBottom: true,
    programmaticScrollGuardUntil: 0,
    isHydratingConversation: false,
    pendingLayoutMutations: 0,
    isStreaming: false,
    isConversationSyncInFlight: false,
    lastConversationSyncFingerprint: null,
    currentTurnBodyEl: null,
    backgroundTaskIndicatorEl: null,
    backgroundTaskInlineEls: new Map(),
    turnBodyByAnchorKey: new Map(),
    pendingEditedFiles: new Set(),
    ...overrides,
  };
}

function createPaneCoordinator(runtimeByTab = new Map<TabId, TestRuntimeState>()) {
  const paneByTab = new Map<TabId, TabMessagesPaneState<TestRuntimeState>>();
  const coordinator = {
    getPaneState: jest.fn((tabId: TabId | null) => (tabId ? paneByTab.get(tabId) ?? null : null)),
    getRuntimeState: jest.fn((tabId: TabId | null) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    ensureRuntimeState: jest.fn((tabId: TabId | null) => {
      if (!tabId) {
        return null;
      }

      let runtime = runtimeByTab.get(tabId);
      if (!runtime) {
        runtime = createRuntimeState();
        runtimeByTab.set(tabId, runtime);
      }
      return runtime;
    }),
    ensurePane: jest.fn((tabId: TabId) => {
      let pane = paneByTab.get(tabId);
      if (!pane) {
        const runtime = runtimeByTab.get(tabId) ?? createRuntimeState();
        runtimeByTab.set(tabId, runtime);
        pane = {
          tabId,
          messagesEl: document.createElement('div'),
          runtime,
          scrollHandler: jest.fn(),
          mutationObserver: null,
          resizeObserver: null,
        };
        paneByTab.set(tabId, pane);
      }
      return pane;
    }),
    setActivePane: jest.fn(),
    removePane: jest.fn(),
    clearPanes: jest.fn(),
    syncScrollMetrics: jest.fn(() => true),
  } as unknown as jest.Mocked<TabMessagesPaneCoordinator<TestRuntimeState>>;

  return { coordinator, paneByTab, runtimeByTab };
}

function createFixture(options: {
  tabBarPosition?: 'input' | 'header' | 'below-header';
  belowHeaderTabBarLayout?: 'grid' | 'vertical';
  sessionStatus?: SessionActivityStatus | null;
  tabContextUsage?: TabContextState | null;
} = {}) {
  let tabManager: TabManager | null = null;
  let tabBar: TabBar | null = null;
  let tabBarMountEl: HTMLElement | null = null;
  let persistedTabState: PersistedTabState = {
    tabs: [],
    activeTabIndex: 0,
  };
  const chatContainerEl = document.createElement('div');
  const headerTabBarSlotEl = document.createElement('div');
  const belowHeaderTabBarSlotEl = document.createElement('div');
  const outerVerticalTabBarSlotEl = document.createElement('div');
  const inputTabBarSlotEl = document.createElement('div');
  const pane = createPaneCoordinator();
  const host: ConversationTabRuntimeCoordinatorHost = {
    getMaxTabs: jest.fn(() => 4),
    getTabManager: jest.fn(() => tabManager),
    setTabManager: jest.fn((nextTabManager) => {
      tabManager = nextTabManager;
    }),
    getTabBar: jest.fn(() => tabBar),
    setTabBar: jest.fn((nextTabBar) => {
      tabBar = nextTabBar;
    }),
    getTabBarMountEl: jest.fn(() => tabBarMountEl),
    setTabBarMountEl: jest.fn((element) => {
      tabBarMountEl = element;
    }),
    getChatContainerEl: jest.fn(() => chatContainerEl),
    getHeaderTabBarSlotEl: jest.fn(() => headerTabBarSlotEl),
    getBelowHeaderTabBarSlotEl: jest.fn(() => belowHeaderTabBarSlotEl),
    getOuterVerticalTabBarSlotEl: jest.fn(() => outerVerticalTabBarSlotEl),
    getInputTabBarSlotEl: jest.fn(() => inputTabBarSlotEl),
    getTabBarPosition: jest.fn(() => options.tabBarPosition ?? 'below-header'),
    getBelowHeaderTabBarLayout: jest.fn(() => options.belowHeaderTabBarLayout ?? 'grid'),
    setPersistedTabState: jest.fn((tabState) => {
      persistedTabState = tabState;
    }),
    savePersistedTabState: jest.fn(),
    getSessionIdForTab: jest.fn((tabId) => (tabId ? `${tabId}-session` : null)),
    getTabSessionStatus: jest.fn(() => options.sessionStatus ?? null),
    getTabContextUsage: jest.fn(() => options.tabContextUsage ?? null),
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
  const coordinator = new ConversationTabRuntimeCoordinator(host, pane.coordinator, ports);

  return {
    coordinator,
    host,
    ports,
    pane,
    chatContainerEl,
    headerTabBarSlotEl,
    belowHeaderTabBarSlotEl,
    outerVerticalTabBarSlotEl,
    inputTabBarSlotEl,
    getTabBarMountEl: () => tabBarMountEl,
    getTabManager: () => tabManager,
    getPersistedTabState: () => persistedTabState,
  };
}

describe('ConversationTabRuntimeCoordinator', () => {
  afterEach(() => {
    document.body.empty();
  });

  it('owns tab manager setup, layout, render, and persisted state writes', () => {
    const fixture = createFixture();

    fixture.coordinator.initializeTabSystem();
    const tabManager = fixture.getTabManager();
    const tab = tabManager?.createTab({ id: 'conv-1', title: 'Conversation 1' });
    const tabBarMountEl = fixture.getTabBarMountEl();

    expect(tab).not.toBeNull();
    expect(tabBarMountEl).not.toBeNull();
    expect(fixture.belowHeaderTabBarSlotEl.contains(tabBarMountEl!)).toBe(true);
    expect(fixture.chatContainerEl.classList.contains(
      'opencodian-container--tab-pos-below-header',
    )).toBe(true);
    expect(fixture.getPersistedTabState()).toEqual({
      tabs: [
        {
          conversationId: 'conv-1',
          title: 'Conversation 1',
          modelOverride: null,
        },
      ],
      activeTabIndex: 0,
    });
    expect(fixture.host.savePersistedTabState).toHaveBeenCalledWith({});
    expect(tabBarMountEl?.querySelector('.opencodian-tab-bar-item')).not.toBeNull();
  });

  it('routes switch, close, bootstrap, restore, and stream-like tab writebacks', async () => {
    const fixture = createFixture();
    fixture.coordinator.initializeTabSystem();
    const firstTab = fixture.getTabManager()?.createTab({ id: 'conv-1', title: 'Conversation 1' });
    const secondTab = fixture.getTabManager()?.createTab({ id: 'conv-2', title: 'Conversation 2' });
    fixture.ports.activateTab.mockClear();

    await fixture.coordinator.handleTabSwitch(firstTab!.id);
    await fixture.coordinator.handleTabClose(secondTab!.id);
    await fixture.coordinator.initializeFirstTab();
    fixture.coordinator.restorePersistedTabs();
    fixture.coordinator.syncTabStreamLikeState(firstTab!.id);
    fixture.coordinator.syncActiveTabStreamLikeState();
    fixture.coordinator.setTabNeedsAttention(secondTab!.id, true);

    expect(fixture.ports.activateTab).toHaveBeenCalledWith(firstTab!.id);
    expect(fixture.ports.closeTabAndRecover).toHaveBeenCalledWith(secondTab!.id);
    expect(fixture.ports.initializeFirstTab).toHaveBeenCalledTimes(1);
    expect(fixture.ports.restorePersistedTabs).toHaveBeenCalledTimes(1);
    expect(fixture.ports.syncTabStreamLikeState).toHaveBeenCalledWith(firstTab!.id);
    expect(fixture.ports.syncActiveTabStreamLikeState).toHaveBeenCalledTimes(1);
    expect(fixture.ports.setTabNeedsAttention).toHaveBeenCalledWith(secondTab!.id, true);
  });

  it('keeps foreground busy gating tied to runtime streaming and session status', () => {
    const fixture = createFixture({
      sessionStatus: {
        type: 'retry',
        attempt: 2,
        message: 'retrying',
        next: 10,
      },
    });
    fixture.pane.runtimeByTab.set('tab-streaming', createRuntimeState({ isStreaming: true }));
    fixture.pane.runtimeByTab.set('tab-retry', createRuntimeState({ isStreaming: false }));

    expect(fixture.coordinator.isTabForegroundBusy('tab-streaming')).toBe(true);
    expect(fixture.coordinator.isTabForegroundBusy('tab-retry')).toBe(true);
    expect(fixture.host.getTabSessionStatus).toHaveBeenCalledWith('tab-retry', 'tab-retry-session');
  });

  it('does not consider an idle non-streaming tab busy when session status is null', () => {
    const fixture = createFixture({ sessionStatus: null });
    fixture.pane.runtimeByTab.set('tab-idle', createRuntimeState({ isStreaming: false }));

    expect(fixture.coordinator.isTabForegroundBusy('tab-idle')).toBe(false);
  });

  it('considers a retry-status tab busy even when the tab itself is not streaming', () => {
    const fixture = createFixture({
      sessionStatus: {
        type: 'retry',
        attempt: 3,
        message: 'rate-limited',
        next: 5,
      },
    });
    fixture.pane.runtimeByTab.set('tab-retry-nostream', createRuntimeState({ isStreaming: false }));

    expect(fixture.coordinator.isTabForegroundBusy('tab-retry-nostream')).toBe(true);
    expect(fixture.host.getTabSessionStatus).toHaveBeenCalledWith('tab-retry-nostream', 'tab-retry-nostream-session');
  });

  it('considers a tab busy when context usage has compactingAt even if not streaming and session is idle', () => {
    const fixture = createFixture({
      sessionStatus: null,
      tabContextUsage: {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        streamInputTokens: 0,
        streamOutputTokens: 0,
        preciseTokens: null,
        totalCost: null,
        contextWindow: 128000,
        percentage: 95,
        provider: null,
        providerName: null,
        model: null,
        modelName: null,
        compactingAt: Date.now(),
        sessionId: 'session-1',
        sessionTitle: null,
        createdAt: null,
        updatedAt: null,
      },
    });
    fixture.pane.runtimeByTab.set('tab-compacting', createRuntimeState({ isStreaming: false }));

    expect(fixture.coordinator.isTabForegroundBusy('tab-compacting')).toBe(true);
    expect(fixture.host.getTabContextUsage).toHaveBeenCalledWith('tab-compacting');
  });

  it('owns turn-body reset, creation, and reuse for tab panes', () => {
    const fixture = createFixture();
    const paneState = fixture.pane.coordinator.ensurePane('tab-1');
    document.body.appendChild(paneState.messagesEl);
    paneState.runtime.backgroundTaskIndicatorEl = document.createElement('div');
    paneState.runtime.backgroundTaskInlineEls.set('background-task', document.createElement('div'));
    paneState.runtime.turnBodyByAnchorKey.set('anchor', document.createElement('div'));

    const turn = fixture.coordinator.createTurn('tab-1');
    const reusedBody = fixture.coordinator.ensureTurnBody('tab-1');

    expect(turn).not.toBeNull();
    expect(turn?.turnEl.classList.contains('opencodian-turn')).toBe(true);
    expect(turn?.headerEl.classList.contains('opencodian-turn-header')).toBe(true);
    expect(turn?.bodyEl.classList.contains('opencodian-turn-body')).toBe(true);
    expect(reusedBody).toBe(turn?.bodyEl);
    expect(paneState.runtime.currentTurnBodyEl).toBe(turn?.bodyEl);

    fixture.coordinator.registerTurnBodyAnchor('tab-1', 'anchor-before', turn!.bodyEl);
    expect(fixture.coordinator.rekeyTurnBodyAnchor('tab-1', 'anchor-before', 'anchor-after')).toBe(true);
    expect(paneState.runtime.turnBodyByAnchorKey.get('anchor-after')).toBe(turn?.bodyEl);

    turn?.turnEl.remove();
    const assistantOnlyBody = fixture.coordinator.ensureTurnBody('tab-1');

    expect(assistantOnlyBody).not.toBeNull();
    expect(assistantOnlyBody).not.toBe(turn?.bodyEl);
    expect(assistantOnlyBody?.parentElement?.classList.contains(
      'opencodian-turn--assistant-only',
    )).toBe(true);

    paneState.runtime.currentTurnBodyEl = null;
    paneState.runtime.backgroundTaskIndicatorEl = document.createElement('div');
    fixture.coordinator.restoreTurnStateFromPane('tab-1');

    expect(paneState.runtime.currentTurnBodyEl).toBe(assistantOnlyBody);
    expect(paneState.runtime.backgroundTaskIndicatorEl).toBeNull();

    fixture.coordinator.resetTurnState('tab-1');

    expect(paneState.runtime.currentTurnBodyEl).toBeNull();
    expect(paneState.runtime.backgroundTaskIndicatorEl).toBeNull();
    expect(paneState.runtime.backgroundTaskInlineEls.size).toBe(0);
    expect(paneState.runtime.turnBodyByAnchorKey.size).toBe(0);
  });

  it('centralizes foreground streaming, sync, edited files, and hydration runtime writes', () => {
    const fixture = createFixture();
    const runtime = createRuntimeState({
      pendingEditedFiles: new Set(['notes.md']),
    });
    fixture.pane.runtimeByTab.set('tab-1', runtime);

    fixture.coordinator.setAutoScrollEnabled('tab-1', false);
    fixture.coordinator.setStreaming('tab-1', true);
    fixture.coordinator.updateConversationSyncRuntime('tab-1', {
      inFlight: true,
      fingerprint: 'fingerprint-1',
    });
    fixture.coordinator.clearPendingEditedFiles('tab-1');
    expect(fixture.coordinator.beginConversationHydration('tab-1')).toBe(true);
    expect(fixture.coordinator.recordHydrationLayoutMutation('tab-1')).toBe(true);
    expect(fixture.coordinator.endConversationHydration('tab-1')).toBe(true);

    expect(runtime.autoScrollEnabled).toBe(false);
    expect(runtime.isStreaming).toBe(true);
    expect(runtime.isConversationSyncInFlight).toBe(true);
    expect(runtime.lastConversationSyncFingerprint).toBe('fingerprint-1');
    expect(runtime.pendingEditedFiles.size).toBe(0);
    expect(runtime.isHydratingConversation).toBe(false);
    expect(runtime.pendingLayoutMutations).toBe(0);
  });
});

describe('createConversationTabRuntimeCoordinatorHost factory', () => {
  function createFactoryDeps(
    overrides: {
      settings?: Partial<TabRuntimeSettings>;
      plugin?: Partial<TabRuntimePluginSource>;
      view?: Partial<TabRuntimeViewSource>;
      tabBarStateOverrides?: Partial<TabBarMutableState>;
    } = {},
  ): ConversationTabRuntimeCoordinatorHostSource {
    const tabBarState: TabBarMutableState = {
      tabManager: null,
      tabBar: null,
      tabBarMountEl: null,
      ...overrides.tabBarStateOverrides,
    };
    const settings: TabRuntimeSettings = {
      maxTabs: 4,
      tabBarPosition: 'below-header' as const,
      belowHeaderTabBarLayout: 'grid' as const,
      ...overrides.settings,
    };
    return {
      tabBarState,
      settings,
      plugin: {
        settings: {
          ...settings,
          tabState: { activeTabId: null, tabs: [] },
        },
        saveSettingsUiStateImmediately: jest.fn(),
        scheduleSettingsUiStateSave: jest.fn(),
        ...overrides.plugin,
      },
      view: {
        getChatContainerEl: jest.fn(() => document.createElement('div')),
        getHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getBelowHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getOuterVerticalTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getInputTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getSessionIdForTab: jest.fn(() => null),
        getTabSessionStatus: jest.fn(() => null),
        ...overrides.view,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads maxTabs from settings object', () => {
    const deps = createFactoryDeps({ settings: { maxTabs: 6 } });
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    expect(host.getMaxTabs()).toBe(6);
  });

  it('reads tabBarPosition from settings object', () => {
    const deps = createFactoryDeps({ settings: { tabBarPosition: 'header' as const } });
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    expect(host.getTabBarPosition()).toBe('header');
  });

  it('reads and writes tabBarState for tabManager, tabBar, and tabBarMountEl', () => {
    const deps = createFactoryDeps();
    const host = createConversationTabRuntimeCoordinatorHost(deps);
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const mountEl = document.createElement('div');

    expect(host.getTabManager()).toBeNull();
    host.setTabManager(tabManager);
    expect(host.getTabManager()).toBe(tabManager);
    expect(deps.tabBarState.tabManager).toBe(tabManager);

    expect(host.getTabBar()).toBeNull();
    expect(host.getTabBarMountEl()).toBeNull();
    host.setTabBarMountEl(mountEl);
    expect(host.getTabBarMountEl()).toBe(mountEl);
    expect(deps.tabBarState.tabBarMountEl).toBe(mountEl);
  });

  it('delegates savePersistedTabState flush to plugin.saveSettingsUiStateImmediately', () => {
    const saveImmediately = jest.fn();
    const scheduleSave = jest.fn();
    const deps = createFactoryDeps({
      plugin: { saveSettingsUiStateImmediately: saveImmediately, scheduleSettingsUiStateSave: scheduleSave },
    });
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    host.savePersistedTabState({ flush: true });
    expect(saveImmediately).toHaveBeenCalledTimes(1);
    expect(scheduleSave).not.toHaveBeenCalled();
  });

  it('delegates savePersistedTabState default to plugin.scheduleSettingsUiStateSave', () => {
    const saveImmediately = jest.fn();
    const scheduleSave = jest.fn();
    const deps = createFactoryDeps({
      plugin: { saveSettingsUiStateImmediately: saveImmediately, scheduleSettingsUiStateSave: scheduleSave },
    });
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    host.savePersistedTabState();
    expect(scheduleSave).toHaveBeenCalledTimes(1);
    expect(saveImmediately).not.toHaveBeenCalled();
  });

  it('derives getTabContextUsage from tabBarState.tabManager with null-safe access', () => {
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const deps = createFactoryDeps({ tabBarStateOverrides: { tabManager } });
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    const result = host.getTabContextUsage('nonexistent-tab');
    expect(result).toBeNull();
  });

  it('returns null from getTabContextUsage when tabBarState.tabManager is null', () => {
    const deps = createFactoryDeps();
    const host = createConversationTabRuntimeCoordinatorHost(deps);

    expect(host.getTabContextUsage('any-tab')).toBeNull();
  });
});

describe('createConversationTabRuntimeCoordinator top-level factory', () => {
  function createTopLevelDeps() {
    const pane = createPaneCoordinator();
    const loadRecoveryCoordinator = {
      activateTab: jest.fn().mockResolvedValue(undefined),
      initializeFirstTab: jest.fn().mockResolvedValue(undefined),
      restorePersistedTabs: jest.fn(() => null as TabId | null),
    };
    const lifecycleRecoveryCoordinator = {
      closeTabAndRecover: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeStateBridge = {
      syncStreamLikeState: jest.fn(),
      syncActiveStreamLikeState: jest.fn(),
      setNeedsAttention: jest.fn(),
    };
    const tabBarState: TabBarMutableState = {
      tabManager: null,
      tabBar: null,
      tabBarMountEl: null,
    };
    const settings: TabRuntimeSettings = {
      maxTabs: 4,
      tabBarPosition: 'below-header',
      belowHeaderTabBarLayout: 'grid',
    };
    const hostSource: ConversationTabRuntimeCoordinatorHostSource = {
      tabBarState,
      settings,
      plugin: {
        settings: {
          ...settings,
          tabState: { activeTabId: null, tabs: [] },
        },
        saveSettingsUiStateImmediately: jest.fn(),
        scheduleSettingsUiStateSave: jest.fn(),
      },
      view: {
        getChatContainerEl: jest.fn(() => document.createElement('div')),
        getHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getBelowHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getOuterVerticalTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getInputTabBarSlotEl: jest.fn(() => document.createElement('div')),
        getSessionIdForTab: jest.fn(() => null),
        getTabSessionStatus: jest.fn(() => null),
      },
    };

    return {
      deps: {
        ...hostSource,
        paneCoordinator: pane.coordinator,
        loadRecoveryCoordinator,
        lifecycleRecoveryCoordinator,
        runtimeStateBridge,
      },
      pane,
      tabBarState,
      loadRecoveryCoordinator,
      lifecycleRecoveryCoordinator,
      runtimeStateBridge,
    };
  }

  afterEach(() => {
    document.body.empty();
  });

  it('assembles ports from coordinator references and returns a working coordinator', async () => {
    const fixture = createTopLevelDeps();
    const coordinator = createConversationTabRuntimeCoordinator(fixture.deps);
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    fixture.deps.tabBarState.tabManager = tabManager;
    tabManager.createTab({ id: 'conv-1', title: 'Tab 1' });
    const secondTab = tabManager.createTab({ id: 'conv-2', title: 'Tab 2' });

    await coordinator.handleTabSwitch(secondTab.id);
    expect(fixture.loadRecoveryCoordinator.activateTab).toHaveBeenCalledWith(secondTab.id);

    await coordinator.handleTabClose(secondTab.id);
    expect(fixture.lifecycleRecoveryCoordinator.closeTabAndRecover).toHaveBeenCalledWith(secondTab.id);

    coordinator.syncTabStreamLikeState(secondTab.id);
    expect(fixture.runtimeStateBridge.syncStreamLikeState).toHaveBeenCalledWith(secondTab.id);

    coordinator.syncActiveTabStreamLikeState();
    expect(fixture.runtimeStateBridge.syncActiveStreamLikeState).toHaveBeenCalledTimes(1);

    coordinator.setTabNeedsAttention(secondTab.id, true);
    expect(fixture.runtimeStateBridge.setNeedsAttention).toHaveBeenCalledWith(secondTab.id, true);
  });

  it('writes through tabBarState mutable properties when coordinator mutates', () => {
    const fixture = createTopLevelDeps();
    const coordinator = createConversationTabRuntimeCoordinator(fixture.deps);

    coordinator.initializeTabSystem();
    expect(fixture.tabBarState.tabManager).not.toBeNull();
    expect(fixture.tabBarState.tabBar).not.toBeNull();
    expect(fixture.tabBarState.tabBarMountEl).not.toBeNull();

    coordinator.destroyTabSystem();
    expect(fixture.tabBarState.tabManager).toBeNull();
    expect(fixture.tabBarState.tabBar).toBeNull();
    expect(fixture.tabBarState.tabBarMountEl).toBeNull();
  });

  it('delegates initializeFirstTab and restorePersistedTabs to loadRecoveryCoordinator', async () => {
    const fixture = createTopLevelDeps();
    const coordinator = createConversationTabRuntimeCoordinator(fixture.deps);

    await coordinator.initializeFirstTab();
    expect(fixture.loadRecoveryCoordinator.initializeFirstTab).toHaveBeenCalledTimes(1);

    coordinator.restorePersistedTabs();
    expect(fixture.loadRecoveryCoordinator.restorePersistedTabs).toHaveBeenCalledTimes(1);
  });
});
