import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { PersistedTabState } from '../../../../src/core/types';
import {
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeCoordinatorHost,
  type ConversationTabRuntimeCoordinatorPorts,
  type ConversationTabRuntimeState,
} from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';
import {
  type TabMessagesPaneCoordinator,
  type TabMessagesPaneState,
} from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';
import type { TabBar, TabId, TabManager } from '../../../../src/features/chat/tabs';

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
