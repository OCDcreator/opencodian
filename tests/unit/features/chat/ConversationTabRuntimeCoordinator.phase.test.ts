import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { TabContextState } from '../../../../src/core/types';
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
import { deriveTabSessionPhase } from '../../../../src/features/chat/services/TabSessionPhase';
import { type TabBar, type TabId, TabManager } from '../../../../src/features/chat/tabs';

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
    ensureRuntimeState: jest.fn(),
    ensurePane: jest.fn(),
    setActivePane: jest.fn(),
    removePane: jest.fn(),
    clearPanes: jest.fn(),
    syncScrollMetrics: jest.fn(() => true),
  } as unknown as jest.Mocked<TabMessagesPaneCoordinator<TestRuntimeState>>;
  return { coordinator, runtimeByTab };
}

function createFixture(options: {
  sessionStatus?: SessionActivityStatus | null;
  tabContextUsage?: TabContextState | null;
} = {}) {
  const pane = createPaneCoordinator();
  const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
  const host: ConversationTabRuntimeCoordinatorHost = {
    getMaxTabs: jest.fn(() => 4),
    getTabManager: jest.fn(() => tabManager),
    setTabManager: jest.fn(),
    getTabBar: jest.fn(() => null as TabBar | null),
    setTabBar: jest.fn(),
    getTabBarMountEl: jest.fn(() => null),
    setTabBarMountEl: jest.fn(),
    getChatContainerEl: jest.fn(() => document.createElement('div')),
    getHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
    getBelowHeaderTabBarSlotEl: jest.fn(() => document.createElement('div')),
    getOuterVerticalTabBarSlotEl: jest.fn(() => document.createElement('div')),
    getInputTabBarSlotEl: jest.fn(() => document.createElement('div')),
    getTabBarPosition: jest.fn(() => 'below-header'),
    getBelowHeaderTabBarLayout: jest.fn(() => 'grid'),
    setPersistedTabState: jest.fn(),
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
  return {
    coordinator: new ConversationTabRuntimeCoordinator(host, pane.coordinator, ports),
    host,
    pane,
    tabManager,
  };
}

function createContextCompactionUsage(): TabContextState {
  return {
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
  };
}

describe('ConversationTabRuntimeCoordinator tab session phase', () => {
  it('derives streaming phase for the current tab and uses it for foreground busy', () => {
    const fixture = createFixture({ sessionStatus: null });
    fixture.pane.runtimeByTab.set('tab-streaming', createRuntimeState({ isStreaming: true }));

    expect(fixture.coordinator.getTabSessionPhase('tab-streaming')).toBe('streaming');
    expect(fixture.coordinator.isTabForegroundBusy('tab-streaming')).toBe(true);
  });

  it('derives streaming-compatible phase for another tab streaming the same session', () => {
    const fixture = createFixture({ sessionStatus: null });
    const firstTab = fixture.tabManager.createTab({ id: 'conversation-1', title: 'Shared' });
    const secondTab = fixture.tabManager.createTab({ id: 'conversation-1', title: 'Shared' });
    fixture.pane.runtimeByTab.set(firstTab.id, createRuntimeState({ isStreaming: true }));
    fixture.pane.runtimeByTab.set(secondTab.id, createRuntimeState({ isStreaming: false }));
    jest.mocked(fixture.host.getSessionIdForTab).mockImplementation((tabId) => (
      tabId === firstTab.id || tabId === secondTab.id ? 'session-shared' : null
    ));

    expect(fixture.coordinator.getTabSessionPhase(secondTab.id)).toBe('streaming');
    expect(fixture.coordinator.isTabForegroundBusy(secondTab.id)).toBe(true);
  });

  it('derives syncing phase without changing foreground busy semantics', () => {
    const fixture = createFixture({ sessionStatus: null });
    fixture.pane.runtimeByTab.set('tab-syncing', createRuntimeState({ isConversationSyncInFlight: true }));

    expect(fixture.coordinator.getTabSessionPhase('tab-syncing')).toBe('syncing');
    expect(fixture.coordinator.isTabForegroundBusy('tab-syncing')).toBe(false);
  });

  it('derives compacting phase and treats it as foreground busy', () => {
    const fixture = createFixture({ sessionStatus: null, tabContextUsage: createContextCompactionUsage() });
    fixture.pane.runtimeByTab.set('tab-compacting', createRuntimeState());

    expect(fixture.coordinator.getTabSessionPhase('tab-compacting')).toBe('compacting');
    expect(fixture.coordinator.isTabForegroundBusy('tab-compacting')).toBe(true);
  });

  it('derives server retrying and busy phases and treats both as foreground busy', () => {
    const fixture = createFixture();
    fixture.pane.runtimeByTab.set('tab-retry', createRuntimeState());
    fixture.pane.runtimeByTab.set('tab-busy', createRuntimeState());
    jest.mocked(fixture.host.getTabSessionStatus).mockImplementation((tabId) => {
      if (tabId === 'tab-retry') return { type: 'retry', attempt: 2, message: 'retrying', next: 10 };
      if (tabId === 'tab-busy') return { type: 'busy' };
      return null;
    });

    expect(fixture.coordinator.getTabSessionPhase('tab-retry')).toBe('server-retrying');
    expect(fixture.coordinator.isTabForegroundBusy('tab-retry')).toBe(true);
    expect(fixture.coordinator.getTabSessionPhase('tab-busy')).toBe('server-busy');
    expect(fixture.coordinator.isTabForegroundBusy('tab-busy')).toBe(true);
  });

  it('derives idle phase when no session activity signals are present', () => {
    const fixture = createFixture({ sessionStatus: null });
    fixture.pane.runtimeByTab.set('tab-idle', createRuntimeState());

    expect(fixture.coordinator.getTabSessionPhase('tab-idle')).toBe('idle');
    expect(fixture.coordinator.isTabForegroundBusy('tab-idle')).toBe(false);
  });
});

describe('deriveTabSessionPhase', () => {
  it('keeps tab session phase priority explicit in the pure derived view', () => {
    expect(deriveTabSessionPhase({
      isStreaming: true,
      isSameSessionStreamingInAnotherTab: true,
      isConversationSyncInFlight: true,
      isContextCompacting: true,
      sessionStatus: { type: 'retry', attempt: 1, message: 'retrying', next: 1 },
    })).toBe('streaming');
    expect(deriveTabSessionPhase({
      isConversationSyncInFlight: true,
      isContextCompacting: true,
      sessionStatus: { type: 'busy' },
    })).toBe('syncing');
    expect(deriveTabSessionPhase({
      isContextCompacting: true,
      sessionStatus: { type: 'retry', attempt: 1, message: 'retrying', next: 1 },
    })).toBe('compacting');
    expect(deriveTabSessionPhase({
      sessionStatus: { type: 'retry', attempt: 1, message: 'retrying', next: 1 },
    })).toBe('server-retrying');
    expect(deriveTabSessionPhase({ sessionStatus: { type: 'busy' } })).toBe('server-busy');
  });
});
