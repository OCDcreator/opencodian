import {
  type ConversationHydrationRuntimeViewHost,
  createConversationHydrationRuntimeViewHosts,
} from '../../../../src/features/chat/services/ConversationHydrationRuntimeViewHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type ScrollRuntimeState = ReturnType<
  ConversationHydrationRuntimeViewHost['getScrollRuntimeForTab']
>;
type TransitionSnapshot = ReturnType<
  ConversationHydrationRuntimeViewHost['getCurrentConversation']
>;

function createFixture() {
  let messagesContainer: HTMLElement | null = {} as HTMLElement;
  let activeTabId: string | null = 'tab-active';
  let scrollRuntime: ScrollRuntimeState = { autoScrollEnabled: true } as ScrollRuntimeState;
  let currentConversation: TransitionSnapshot = {
    id: 'conversation-current',
    titleGenerationStatus: 'pending',
  };

  const host: Mocked<ConversationHydrationRuntimeViewHost> = {
    getMessagesContainer: jest.fn(() => messagesContainer),
    getActiveTabId: jest.fn(() => activeTabId),
    getScrollRuntimeForTab: jest.fn(() => scrollRuntime),
    scrollToBottom: jest.fn(),
    syncPaneScrollMetrics: jest.fn(),
    requestAnimationFrame: jest.fn().mockReturnValue(7),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderMessages: jest.fn().mockResolvedValue(undefined),
    getCurrentConversation: jest.fn(() => currentConversation),
    cancelTitleGeneration: jest.fn(),
    clearPendingTitleGenerationStatus: jest.fn().mockResolvedValue(undefined),
    resetBackgroundTaskIndicator: jest.fn(),
    clearScheduledScrollToBottom: jest.fn(),
    beginConversationHydration: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    endConversationHydration: jest.fn(),
  };

  return {
    host,
    setActiveTabId: (next: string | null) => {
      activeTabId = next;
    },
    setCurrentConversation: (next: TransitionSnapshot) => {
      currentConversation = next;
    },
    setMessagesContainer: (next: HTMLElement | null) => {
      messagesContainer = next;
    },
    setScrollRuntime: (next: ScrollRuntimeState) => {
      scrollRuntime = next;
    },
  };
}

describe('ConversationHydrationRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives hydration and transition hosts from the flattened view seam', async () => {
    const fixture = createFixture();
    const {
      conversationHydrationRenderBridgeHost,
      conversationHydrationOutcomeBridgeHost,
      conversationTransitionBridgeHost,
    } = createConversationHydrationRuntimeViewHosts(fixture.host);
    const conversation = {
      id: 'conversation-next',
      messages: [],
    } as Parameters<
      ConversationHydrationRuntimeViewHost['syncBackgroundTaskStateFromConversation']
    >[0];
    const messages: Parameters<ConversationHydrationRuntimeViewHost['renderMessages']>[0] = [];
    const messagesEl = {} as HTMLElement;

    expect(conversationHydrationRenderBridgeHost.getMessagesContainer()).toBe(
      fixture.host.getMessagesContainer.mock.results[0].value,
    );
    expect(conversationHydrationRenderBridgeHost.getActiveTabId()).toBe('tab-active');
    expect(conversationHydrationRenderBridgeHost.getScrollRuntimeForTab('tab-active')).toEqual({
      autoScrollEnabled: true,
    });
    conversationHydrationRenderBridgeHost.scrollToBottom({ tabId: 'tab-active' });
    conversationHydrationRenderBridgeHost.syncPaneScrollMetrics('tab-active', messagesEl);
    expect(conversationHydrationRenderBridgeHost.requestAnimationFrame(() => undefined)).toBe(7);

    expect(conversationTransitionBridgeHost.getCurrentConversation()).toEqual({
      id: 'conversation-current',
      titleGenerationStatus: 'pending',
    });
    conversationTransitionBridgeHost.cancelTitleGeneration('conversation-current');
    await conversationTransitionBridgeHost.clearPendingTitleGenerationStatus(
      'conversation-current',
    );
    conversationTransitionBridgeHost.resetBackgroundTaskIndicator();
    conversationTransitionBridgeHost.clearScheduledScrollToBottom();
    conversationTransitionBridgeHost.beginConversationHydration('tab-active');
    conversationTransitionBridgeHost.clearMessagesContainer();
    conversationTransitionBridgeHost.resetTurnState();
    conversationTransitionBridgeHost.endConversationHydration('tab-active');

    conversationHydrationOutcomeBridgeHost.syncBackgroundTaskStateFromConversation(conversation);
    await conversationHydrationOutcomeBridgeHost.renderMessages(messages);

    expect(fixture.host.scrollToBottom).toHaveBeenCalledWith({
      tabId: 'tab-active',
    });
    expect(fixture.host.syncPaneScrollMetrics)
      .toHaveBeenCalledWith('tab-active', messagesEl);
    expect(fixture.host.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.host.cancelTitleGeneration).toHaveBeenCalledWith('conversation-current');
    expect(fixture.host.clearPendingTitleGenerationStatus)
      .toHaveBeenCalledWith('conversation-current');
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearScheduledScrollToBottom).toHaveBeenCalledTimes(1);
    expect(fixture.host.beginConversationHydration).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.host.endConversationHydration).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation);
    expect(fixture.host.renderMessages).toHaveBeenCalledWith(messages);
  });

  it('keeps the flattened seam late-bound to the latest hydration collaborators', async () => {
    const fixture = createFixture();
    const {
      conversationHydrationRenderBridgeHost,
      conversationHydrationOutcomeBridgeHost,
      conversationTransitionBridgeHost,
    } = createConversationHydrationRuntimeViewHosts(fixture.host);
    const nextMessagesContainer = {} as HTMLElement;

    fixture.setMessagesContainer(nextMessagesContainer);
    fixture.setActiveTabId('tab-next');
    fixture.setScrollRuntime({ autoScrollEnabled: false } as ScrollRuntimeState);
    fixture.setCurrentConversation({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });
    fixture.host.requestAnimationFrame.mockReturnValue(11);

    expect(conversationHydrationRenderBridgeHost.getMessagesContainer()).toBe(nextMessagesContainer);
    expect(conversationHydrationRenderBridgeHost.getActiveTabId()).toBe('tab-next');
    expect(conversationHydrationRenderBridgeHost.getScrollRuntimeForTab('tab-next')).toEqual({
      autoScrollEnabled: false,
    });
    expect(conversationHydrationRenderBridgeHost.requestAnimationFrame(() => undefined)).toBe(11);
    expect(conversationTransitionBridgeHost.getCurrentConversation()).toEqual({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });
    conversationTransitionBridgeHost.clearMessagesContainer();
    await conversationHydrationOutcomeBridgeHost.renderMessages([]);

    expect(fixture.host.getMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.host.getScrollRuntimeForTab).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.host.getCurrentConversation).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.renderMessages).toHaveBeenCalledWith([]);
  });
});
