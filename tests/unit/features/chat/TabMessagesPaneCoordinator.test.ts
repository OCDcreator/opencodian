import {
  TabMessagesPaneCoordinator,
  type TabMessagesPaneCoordinatorHost,
  type TabMessagesPaneRuntimeState,
} from '../../../../src/features/chat/services/TabMessagesPaneCoordinator';

interface TestRuntimeState extends TabMessagesPaneRuntimeState {
  streamController: {
    cancelStream: jest.Mock<void, []>;
  } | null;
}

type MockedTabMessagesPaneCoordinatorHost = {
  [Key in keyof TabMessagesPaneCoordinatorHost<TestRuntimeState>]:
    TabMessagesPaneCoordinatorHost<TestRuntimeState>[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : TabMessagesPaneCoordinatorHost<TestRuntimeState>[Key];
};

function createRuntimeState(): TestRuntimeState {
  return {
    autoScrollEnabled: true,
    isNearBottom: true,
    programmaticScrollGuardUntil: 0,
    isHydratingConversation: false,
    pendingLayoutMutations: 0,
    isStreaming: false,
    streamController: {
      cancelStream: jest.fn(),
    },
  };
}

function setElementMetrics(
  element: HTMLElement,
  metrics: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  },
): void {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: metrics.scrollTop,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    enumerable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    enumerable: true,
    value: metrics.clientHeight,
  });
}

function flushMutations(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function createFixture(activeTabId = 'tab-1') {
  const messagesShellEl = document.createElement('div');
  document.body.appendChild(messagesShellEl);

  let messagesContainer: HTMLElement | null = null;
  let currentActiveTabId: string | null = activeTabId;
  const host: MockedTabMessagesPaneCoordinatorHost = {
    getMessagesShellEl: jest.fn(() => messagesShellEl),
    getMessagesContainer: jest.fn(() => messagesContainer),
    setMessagesContainer: jest.fn((messagesEl) => {
      messagesContainer = messagesEl;
    }),
    getActiveTabId: jest.fn(() => currentActiveTabId),
    createRuntimeState: jest.fn(() => createRuntimeState()),
    applyChatScrollModeToMessagesEl: jest.fn(),
    resetTurnState: jest.fn(),
    restoreTurnStateFromActivePane: jest.fn(),
    rebuildNavigationSidebar: jest.fn(),
    destroyNavigationSidebar: jest.fn(),
    updateNavigationSidebarVisibility: jest.fn(),
    clearScheduledSignalConversationSync: jest.fn(),
    shouldAutoScroll: jest.fn(() => true),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
  };

  return {
    coordinator: new TabMessagesPaneCoordinator(host),
    host,
    messagesShellEl,
    getMessagesContainer: () => messagesContainer,
    setActiveTabId: (tabId: string | null) => {
      currentActiveTabId = tabId;
    },
  };
}

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(_callback: ResizeObserverCallback) {}
}

describe('TabMessagesPaneCoordinator', () => {
  const originalResizeObserver = global.ResizeObserver;

  beforeEach(() => {
    jest.clearAllMocks();
    global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    document.body.empty();
    if (originalResizeObserver) {
      global.ResizeObserver = originalResizeObserver;
    } else {
      delete (global as typeof global & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
  });

  it('creates and activates tab panes through a single coordinator surface', () => {
    const fixture = createFixture();

    const firstPane = fixture.coordinator.ensurePane('tab-1');
    const secondPane = fixture.coordinator.ensurePane('tab-2');
    setElementMetrics(firstPane!.messagesEl, {
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
    });

    fixture.coordinator.setActivePane('tab-1');

    expect(fixture.coordinator.applyScrollModeToPanes()).toBe(true);
    expect(fixture.host.applyChatScrollModeToMessagesEl).toHaveBeenCalledWith(firstPane!.messagesEl);
    expect(fixture.host.applyChatScrollModeToMessagesEl).toHaveBeenCalledWith(secondPane!.messagesEl);
    expect(firstPane!.messagesEl.classList.contains('is-active')).toBe(true);
    expect(secondPane!.messagesEl.classList.contains('is-active')).toBe(false);
    expect(fixture.getMessagesContainer()).toBe(firstPane!.messagesEl);
    expect(fixture.host.restoreTurnStateFromActivePane).toHaveBeenCalledTimes(1);
    expect(fixture.host.rebuildNavigationSidebar).toHaveBeenCalledTimes(1);
    expect(fixture.host.updateNavigationSidebarVisibility).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleSettledScrollToBottomIfNeeded).toHaveBeenCalledWith(true, 'tab-1');
  });

  it('defers layout-driven auto-scroll while the tab is hydrating', async () => {
    const fixture = createFixture();
    const pane = fixture.coordinator.ensurePane('tab-1');
    if (!pane) {
      throw new Error('Expected a tab pane');
    }

    pane.runtime.isHydratingConversation = true;
    pane.runtime.pendingLayoutMutations = 0;
    setElementMetrics(pane.messagesEl, {
      scrollTop: 10,
      scrollHeight: 200,
      clientHeight: 100,
    });

    pane.messagesEl.appendChild(document.createElement('div'));
    await flushMutations();

    expect(pane.runtime.pendingLayoutMutations).toBe(1);
    expect(fixture.host.updateNavigationSidebarVisibility).toHaveBeenCalled();
    expect(fixture.host.scheduleSettledScrollToBottomIfNeeded).not.toHaveBeenCalled();
  });

  it('cleans up active pane state on remove and clear', () => {
    const fixture = createFixture();
    const firstPane = fixture.coordinator.ensurePane('tab-1');
    const secondPane = fixture.coordinator.ensurePane('tab-2');
    if (!firstPane || !secondPane) {
      throw new Error('Expected tab panes');
    }

    fixture.coordinator.setActivePane('tab-1');
    fixture.host.resetTurnState.mockClear();
    fixture.host.destroyNavigationSidebar.mockClear();

    fixture.coordinator.removePane('tab-1');

    expect(firstPane.runtime.streamController?.cancelStream).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearScheduledSignalConversationSync).toHaveBeenCalledWith('tab-1');
    expect(fixture.getMessagesContainer()).toBeNull();
    expect(fixture.host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.host.destroyNavigationSidebar).toHaveBeenCalledTimes(1);
    expect(fixture.coordinator.getPaneState('tab-1')).toBeNull();

    fixture.coordinator.clearPanes();

    expect(secondPane.runtime.streamController?.cancelStream).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearScheduledSignalConversationSync).toHaveBeenCalledWith('tab-2');
    expect(fixture.messagesShellEl.querySelector('.opencodian-messages-pane')).toBeNull();
    expect(fixture.coordinator.getPaneState('tab-2')).toBeNull();
  });
});
