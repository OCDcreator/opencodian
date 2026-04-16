import type { ConversationHydrationRenderPort } from '../../../../src/features/chat/runtime/ConversationHydrationRenderBridge';
import {
  ConversationTransitionBridge,
  type ConversationTransitionBridgeHost,
} from '../../../../src/features/chat/runtime/ConversationTransitionBridge';

type MockedConversationHydrationRenderPort = {
  [Key in keyof ConversationHydrationRenderPort]:
    ConversationHydrationRenderPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ConversationHydrationRenderPort[Key];
};

function createHydrationRenderBridge(
  overrides: Partial<MockedConversationHydrationRenderPort> = {},
): MockedConversationHydrationRenderPort {
  const context = {
    activeTabId: 'tab-1',
    messagesEl: document.createElement('div'),
    runtime: {
      autoScrollEnabled: false,
      programmaticScrollGuardUntil: 0,
    },
    preserveScrollPosition: true,
    previousScrollTop: 120,
    shouldStickToBottom: false,
  };

  return {
    captureHydrationContext: jest.fn().mockReturnValue(context),
    beginHydrationShell: jest.fn(),
    restoreHydrationShell: jest.fn(),
    ...overrides,
  };
}

function createHost(
  overrides: Partial<jest.Mocked<ConversationTransitionBridgeHost>> = {},
): jest.Mocked<ConversationTransitionBridgeHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue({
      id: 'previous-conversation',
      titleGenerationStatus: 'pending',
    }),
    cancelTitleGeneration: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    clearPendingTitleGenerationStatus: jest.fn().mockResolvedValue(undefined),
    clearScheduledScrollToBottom: jest.fn(),
    beginConversationHydration: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    endConversationHydration: jest.fn(),
    ...overrides,
  };
}

describe('ConversationTransitionBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cleans up the previous loaded conversation before switching', async () => {
    const host = createHost();
    const hydrationRenderBridge = createHydrationRenderBridge();
    const bridge = new ConversationTransitionBridge(host, hydrationRenderBridge);

    await bridge.prepareLoadedConversationTransition('next-conversation');

    expect(host.cancelTitleGeneration).toHaveBeenCalledWith('previous-conversation');
    expect(host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(host.clearPendingTitleGenerationStatus).toHaveBeenCalledWith('previous-conversation');
  });

  it('runs the loaded-conversation shell cleanup in bridge order', () => {
    const callOrder: string[] = [];
    const host = createHost({
      clearScheduledScrollToBottom: jest.fn(() => {
        callOrder.push('clearScheduledScrollToBottom');
      }),
      beginConversationHydration: jest.fn(() => {
        callOrder.push('beginConversationHydration');
      }),
      clearMessagesContainer: jest.fn(() => {
        callOrder.push('clearMessagesContainer');
      }),
      resetTurnState: jest.fn(() => {
        callOrder.push('resetTurnState');
      }),
      endConversationHydration: jest.fn(() => {
        callOrder.push('endConversationHydration');
      }),
    });
    const hydrationRenderBridge = createHydrationRenderBridge({
      beginHydrationShell: jest.fn(() => {
        callOrder.push('beginHydrationShell');
      }),
      restoreHydrationShell: jest.fn(() => {
        callOrder.push('restoreHydrationShell');
      }),
    });
    const bridge = new ConversationTransitionBridge(host, hydrationRenderBridge);

    const context = bridge.captureLoadedConversationTransition(true);
    bridge.beginLoadedConversationTransition(context);
    bridge.restoreLoadedConversationTransition(context);
    bridge.endLoadedConversationTransition(context);

    expect(hydrationRenderBridge.captureHydrationContext).toHaveBeenCalledWith(true);
    expect(callOrder).toEqual([
      'clearScheduledScrollToBottom',
      'beginConversationHydration',
      'beginHydrationShell',
      'clearMessagesContainer',
      'resetTurnState',
      'restoreHydrationShell',
      'endConversationHydration',
    ]);
  });
});
