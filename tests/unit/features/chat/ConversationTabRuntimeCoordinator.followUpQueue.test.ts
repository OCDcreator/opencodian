import type { SessionActivityStatus } from '../../../../src/core/opencode';
import {
  ConversationTabRuntimeCoordinator,
  type ConversationTabRuntimeCoordinatorHost,
  type ConversationTabRuntimeCoordinatorPorts,
  type ConversationTabRuntimeState,
} from '../../../../src/features/chat/services/ConversationTabRuntimeCoordinator';
import type {
  TabMessagesPaneCoordinator,
} from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';
import type { TabBar, TabId } from '../../../../src/features/chat/tabs';

function createRuntimeState(overrides: Partial<ConversationTabRuntimeState> = {}): ConversationTabRuntimeState {
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

function createFixture() {
  const runtimeByTab = new Map<TabId, ConversationTabRuntimeState>();
  const paneCoordinator = {
    getRuntimeState: jest.fn((tabId: TabId | null) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getPaneState: jest.fn(() => null),
    ensureRuntimeState: jest.fn(),
    ensurePane: jest.fn(),
    setActivePane: jest.fn(),
    removePane: jest.fn(),
    clearPanes: jest.fn(),
    syncScrollMetrics: jest.fn(),
    suppressNextLayoutAutoScroll: jest.fn(),
  } as unknown as jest.Mocked<TabMessagesPaneCoordinator<ConversationTabRuntimeState>>;
  const host: ConversationTabRuntimeCoordinatorHost = {
    getMaxTabs: jest.fn(() => 4),
    getTabManager: jest.fn(() => null),
    setTabManager: jest.fn(),
    getTabBar: jest.fn(() => null as TabBar | null),
    setTabBar: jest.fn(),
    getTabBarMountEl: jest.fn(() => null),
    setTabBarMountEl: jest.fn(),
    getChatContainerEl: jest.fn(() => null),
    getHeaderTabBarSlotEl: jest.fn(() => null),
    getBelowHeaderTabBarSlotEl: jest.fn(() => null),
    getOuterVerticalTabBarSlotEl: jest.fn(() => null),
    getInputTabBarSlotEl: jest.fn(() => null),
    getTabBarPosition: jest.fn(() => 'below-header'),
    getBelowHeaderTabBarLayout: jest.fn(() => 'grid'),
    setPersistedTabState: jest.fn(),
    savePersistedTabState: jest.fn(),
    getSessionIdForTab: jest.fn(() => null),
    getTabSessionStatus: jest.fn(() => null as SessionActivityStatus | null),
    getTabContextUsage: jest.fn(() => null),
  };
  const ports: ConversationTabRuntimeCoordinatorPorts = {
    activateTab: jest.fn(),
    closeTabAndRecover: jest.fn(),
    initializeFirstTab: jest.fn(),
    restorePersistedTabs: jest.fn(() => null),
    syncTabStreamLikeState: jest.fn(),
    syncActiveTabStreamLikeState: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
  const coordinator = new ConversationTabRuntimeCoordinator(host, paneCoordinator, ports);
  return { coordinator, runtimeByTab };
}

describe('ConversationTabRuntimeCoordinator follow-up queue', () => {
  it('queues at most one follow-up send per busy tab and rejects a second queued send', () => {
    const fixture = createFixture();
    fixture.runtimeByTab.set('tab-1', createRuntimeState({ isStreaming: true }));

    expect(fixture.coordinator.queueFollowUpSend('tab-1', { content: 'next prompt' })).toBe(true);
    expect(fixture.coordinator.queueFollowUpSend('tab-1', { content: 'replacement prompt' })).toBe(false);
    expect(fixture.coordinator.consumeQueuedFollowUpSend('tab-1')).toEqual({ content: 'next prompt' });
    expect(fixture.coordinator.consumeQueuedFollowUpSend('tab-1')).toBeNull();
  });

  it('keeps queued follow-up sends isolated per tab', () => {
    const fixture = createFixture();
    fixture.runtimeByTab.set('tab-1', createRuntimeState({ isStreaming: true }));
    fixture.runtimeByTab.set('tab-2', createRuntimeState({ isStreaming: true }));

    expect(fixture.coordinator.queueFollowUpSend('tab-1', { content: 'tab one' })).toBe(true);
    expect(fixture.coordinator.queueFollowUpSend('tab-2', { content: 'tab two' })).toBe(true);

    expect(fixture.coordinator.consumeQueuedFollowUpSend('tab-2')).toEqual({ content: 'tab two' });
    expect(fixture.coordinator.consumeQueuedFollowUpSend('tab-1')).toEqual({ content: 'tab one' });
  });

  it('does not queue follow-up sends when the tab runtime is absent', () => {
    const fixture = createFixture();

    expect(fixture.coordinator.queueFollowUpSend('missing-tab', { content: 'lost prompt' })).toBe(false);
    expect(fixture.coordinator.consumeQueuedFollowUpSend('missing-tab')).toBeNull();
  });

  it('does not queue follow-up sends when the tab is busy for a reason other than its own stream', () => {
    const fixture = createFixture();
    fixture.runtimeByTab.set('tab-1', createRuntimeState({ isStreaming: false }));

    expect(fixture.coordinator.queueFollowUpSend('tab-1', { content: 'not stream-backed' })).toBe(false);
    expect(fixture.coordinator.consumeQueuedFollowUpSend('tab-1')).toBeNull();
  });
});
