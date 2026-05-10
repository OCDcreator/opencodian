import type { PersistedTabState } from '../../../../src/core/types';
import {
  assembleConversationTabRuntime,
  type ConversationTabRuntimeCoordinatorDependencies,
  type ConversationTabRuntimeState,
  type TabBarMutableState,
  type TabRuntimePluginSource,
  type TabRuntimeSettings,
  type TabRuntimeViewSource,
} from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';
import {
  type TabMessagesPaneCoordinator,
  type TabMessagesPaneState,
} from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';
import { type TabId, TabManager } from '../../../../src/features/chat/tabs';

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
      if (!tabId) return null;
      let runtime = runtimeByTab.get(tabId);
      if (!runtime) { runtime = createRuntimeState(); runtimeByTab.set(tabId, runtime); }
      return runtime;
    }),
    ensurePane: jest.fn((tabId: TabId) => {
      let pane = paneByTab.get(tabId);
      if (!pane) {
        const runtime = runtimeByTab.get(tabId) ?? createRuntimeState();
        runtimeByTab.set(tabId, runtime);
        pane = { tabId, messagesEl: document.createElement('div'), runtime, scrollHandler: jest.fn(), mutationObserver: null, resizeObserver: null };
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

function createAssemblyDeps(): ConversationTabRuntimeCoordinatorDependencies<TestRuntimeState> {
  const pane = createPaneCoordinator();
  const loadRecoveryCoordinator = {
    activateTab: jest.fn().mockResolvedValue(undefined),
    initializeFirstTab: jest.fn().mockResolvedValue(undefined),
    restorePersistedTabs: jest.fn(() => null as TabId | null),
  };
  const lifecycleRecoveryCoordinator = { closeTabAndRecover: jest.fn().mockResolvedValue(undefined) };
  const runtimeStateBridge = {
    syncStreamLikeState: jest.fn(),
    syncActiveStreamLikeState: jest.fn(),
    setNeedsAttention: jest.fn(),
  };
  const settings: TabRuntimeSettings = {
    maxTabs: 4,
    tabBarPosition: 'below-header',
    belowHeaderTabBarLayout: 'grid',
  };
  const tabBarState: TabBarMutableState = { tabManager: null, tabBar: null, tabBarMountEl: null };

  return {
    tabBarState,
    settings,
    plugin: {
      settings: { ...settings, tabState: { activeTabId: null, tabs: [] } as PersistedTabState },
      saveSettingsUiStateImmediately: jest.fn(),
      scheduleSettingsUiStateSave: jest.fn(),
      trimConversationFullMessageCache: jest.fn(),
    } as unknown as TabRuntimePluginSource,
    view: {
      getChatContainerEl: jest.fn(() => document.createElement('div')),
      getHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getBelowHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getOuterVerticalTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getInputTabBarSlotEl: jest.fn(() => document.createElement('div')),
      getSessionIdForTab: jest.fn(() => null),
      getTabSessionStatus: jest.fn(() => null),
    } as unknown as TabRuntimeViewSource,
    paneCoordinator: pane.coordinator,
    loadRecoveryCoordinator,
    lifecycleRecoveryCoordinator,
    runtimeStateBridge,
  };
}

describe('assembleConversationTabRuntime', () => {
  afterEach(() => {
    document.body.empty();
  });

  it('returns a working coordinator with assembled ports', async () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    expect(coordinator).toBeDefined();
    expect(coordinator).toBeInstanceOf(Object);
  });

  it('wires handleTabSwitch to loadRecoveryCoordinator.activateTab', async () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    deps.tabBarState.tabManager = tabManager;
    tabManager.createTab({ id: 'conv-1', title: 'Tab 1' });
    const secondTab = tabManager.createTab({ id: 'conv-2', title: 'Tab 2' });

    await coordinator.handleTabSwitch(secondTab.id);

    expect(deps.loadRecoveryCoordinator.activateTab).toHaveBeenCalledWith(secondTab.id);
  });

  it('wires handleTabClose to lifecycleRecoveryCoordinator.closeTabAndRecover', async () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    deps.tabBarState.tabManager = tabManager;
    const tab = tabManager.createTab({ id: 'conv-1', title: 'Tab 1' });

    await coordinator.handleTabClose(tab.id);

    expect(deps.lifecycleRecoveryCoordinator.closeTabAndRecover).toHaveBeenCalledWith(tab.id);
  });

  it('wires syncTabStreamLikeState to runtimeStateBridge.syncStreamLikeState', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.syncTabStreamLikeState('tab-1');
    expect(deps.runtimeStateBridge.syncStreamLikeState).toHaveBeenCalledWith('tab-1');
  });

  it('wires syncActiveTabStreamLikeState to runtimeStateBridge.syncActiveStreamLikeState', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.syncActiveTabStreamLikeState();
    expect(deps.runtimeStateBridge.syncActiveStreamLikeState).toHaveBeenCalledTimes(1);
  });

  it('wires setTabNeedsAttention to runtimeStateBridge.setNeedsAttention', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.setTabNeedsAttention('tab-1', true);
    expect(deps.runtimeStateBridge.setNeedsAttention).toHaveBeenCalledWith('tab-1', true);
  });

  it('wires initializeFirstTab to loadRecoveryCoordinator.initializeFirstTab', async () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    await coordinator.initializeFirstTab();
    expect(deps.loadRecoveryCoordinator.initializeFirstTab).toHaveBeenCalledTimes(1);
  });

  it('wires restorePersistedTabs to loadRecoveryCoordinator.restorePersistedTabs', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.restorePersistedTabs();
    expect(deps.loadRecoveryCoordinator.restorePersistedTabs).toHaveBeenCalledTimes(1);
  });

  it('initializes tab system with mutable state wired through host', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.initializeTabSystem();

    expect(deps.tabBarState.tabManager).not.toBeNull();
    expect(deps.tabBarState.tabBar).not.toBeNull();
    expect(deps.tabBarState.tabBarMountEl).not.toBeNull();
  });

  it('destroys tab system and clears mutable state', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.initializeTabSystem();
    coordinator.destroyTabSystem();

    expect(deps.tabBarState.tabManager).toBeNull();
    expect(deps.tabBarState.tabBar).toBeNull();
    expect(deps.tabBarState.tabBarMountEl).toBeNull();
  });

  it('persists tab state through plugin scheduleSave by default', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.initializeTabSystem();
    const tabManager = deps.tabBarState.tabManager!;
    tabManager.createTab({ id: 'conv-1', title: 'Tab 1' });
    jest.clearAllMocks();

    coordinator.persistTabState();

    expect(deps.plugin.scheduleSettingsUiStateSave).toHaveBeenCalledTimes(1);
    expect(deps.plugin.saveSettingsUiStateImmediately).not.toHaveBeenCalled();
  });

  it('flushes tab state through plugin saveImmediately when flush is true', () => {
    const deps = createAssemblyDeps();
    const coordinator = assembleConversationTabRuntime(deps);

    coordinator.initializeTabSystem();
    const tabManager = deps.tabBarState.tabManager!;
    tabManager.createTab({ id: 'conv-1', title: 'Tab 1' });
    jest.clearAllMocks();

    coordinator.persistTabState({ flush: true });

    expect(deps.plugin.saveSettingsUiStateImmediately).toHaveBeenCalledTimes(1);
    expect(deps.plugin.scheduleSettingsUiStateSave).not.toHaveBeenCalled();
  });
});
