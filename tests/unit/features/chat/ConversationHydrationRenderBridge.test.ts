jest.mock('../../../../src/features/chat/services/ScrollManager', () => {
  const actual = jest.requireActual('../../../../src/features/chat/services/ScrollManager');
  return {
    ...actual,
    captureElementScrollRestoreSnapshot: jest.fn(() => ({
      mode: 'preserve-distance',
      scrollTop: 120,
      distanceFromBottom: 40,
      anchorMessageId: null,
      anchorOffsetTop: 0,
    })),
    restoreElementScrollAfterRender: jest.fn((_messagesEl, _snapshot, options) => {
      options?.onRestored?.(120);
    }),
    isElementNearBottom: jest.fn(() => false),
  };
});

import {
  ConversationHydrationRenderBridge,
  type ConversationHydrationRenderBridgeHost,
} from '../../../../src/features/chat/runtime/ConversationHydrationRenderBridge';
import {
  captureElementScrollRestoreSnapshot,
  isElementNearBottom,
  restoreElementScrollAfterRender,
} from '../../../../src/features/chat/services/ScrollManager';

describe('ConversationHydrationRenderBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createHost(
    overrides: Partial<jest.Mocked<ConversationHydrationRenderBridgeHost>> = {},
  ): jest.Mocked<ConversationHydrationRenderBridgeHost> {
    const messagesEl = document.createElement('div');
    Object.defineProperty(messagesEl, 'scrollTop', {
      value: 120,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(messagesEl, 'scrollHeight', {
      value: 600,
      configurable: true,
    });
    Object.defineProperty(messagesEl, 'clientHeight', {
      value: 300,
      configurable: true,
    });

    return {
      getMessagesContainer: jest.fn().mockReturnValue(messagesEl),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getScrollRuntimeForTab: jest.fn().mockReturnValue({
        autoScrollEnabled: false,
        programmaticScrollGuardUntil: 0,
      }),
      scrollToBottom: jest.fn(),
      syncPaneScrollMetrics: jest.fn(),
      requestAnimationFrame: jest.fn().mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      ...overrides,
    };
  }

  it('captures the active-tab hydration shell inputs with preserved scroll state', () => {
    const host = createHost({
      getScrollRuntimeForTab: jest.fn().mockReturnValue(null),
    });
    const bridge = new ConversationHydrationRenderBridge(host);

    const context = bridge.captureHydrationContext(true);

    expect(host.getMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(host.getScrollRuntimeForTab).toHaveBeenCalledWith('tab-1');
    expect(isElementNearBottom).toHaveBeenCalledWith(context.messagesEl);
    expect(context).toMatchObject({
      activeTabId: 'tab-1',
      preserveScrollPosition: true,
      previousScrollTop: 120,
      shouldStickToBottom: false,
    });
  });

  it('restores the rehydrating class and scroll shell through ScrollManager helpers', () => {
    const host = createHost();
    const bridge = new ConversationHydrationRenderBridge(host);
    const context = bridge.captureHydrationContext(true);

    bridge.beginHydrationShell(context);
    expect(context.messagesEl?.classList.contains('is-rehydrating')).toBe(true);

    bridge.restoreHydrationShell(context);

    expect(context.runtime?.autoScrollEnabled).toBe(false);
    expect(captureElementScrollRestoreSnapshot).toHaveBeenCalledWith(context.messagesEl, false, 120);
    expect(restoreElementScrollAfterRender).toHaveBeenCalled();
    expect(host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-1', context.messagesEl);
    expect(host.scrollToBottom).not.toHaveBeenCalled();
    expect(context.messagesEl?.classList.contains('is-rehydrating')).toBe(false);
  });
});
