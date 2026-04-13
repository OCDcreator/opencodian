import {
  createConversationHydrationRuntimeViewHostFactoryHost,
  type ConversationHydrationRuntimeHostProviderHost,
} from '../../../../src/features/chat/services/ConversationHydrationRuntimeHostProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type ScrollRuntimeState = ReturnType<
  ConversationHydrationRuntimeHostProviderHost['getScrollRuntimeForTab']
>;
type TransitionSnapshot = ReturnType<
  ConversationHydrationRuntimeHostProviderHost['getCurrentConversation']
>;

function createFixture() {
  let messagesContainer = { empty: jest.fn() } as unknown as HTMLElement;
  let activeTabId: string | null = 'tab-active';
  let scrollRuntime: ScrollRuntimeState = { autoScrollEnabled: true } as ScrollRuntimeState;
  let currentConversation: TransitionSnapshot = {
    id: 'conversation-active',
    titleGenerationStatus: 'pending',
  };

  const host: Mocked<ConversationHydrationRuntimeHostProviderHost> = {
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
      messagesContainer = next as HTMLElement;
    },
    setScrollRuntime: (next: ScrollRuntimeState) => {
      scrollRuntime = next;
    },
  };
}

describe('ConversationHydrationRuntimeHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin hydration seam into the existing factory host ports', async () => {
    const fixture = createFixture();
    const factoryHost = createConversationHydrationRuntimeViewHostFactoryHost(fixture.host);
    const hydrationRenderRuntime = factoryHost.getHydrationRenderRuntime();
    const hydrationOutcomeRuntime = factoryHost.getHydrationOutcomeRuntime();
    const transitionState = factoryHost.getConversationTransitionState();
    const transitionWriteback = factoryHost.getConversationTransitionWriteback();
    const messagesEl = {} as HTMLElement;
    const conversation = { id: 'conversation-next', messages: [] } as Parameters<
      ConversationHydrationRuntimeHostProviderHost['syncBackgroundTaskStateFromConversation']
    >[0];

    expect(hydrationRenderRuntime.getMessagesContainer()).toBe(
      fixture.host.getMessagesContainer.mock.results[0].value,
    );
    expect(hydrationRenderRuntime.getActiveTabId()).toBe('tab-active');
    expect(hydrationRenderRuntime.getScrollRuntimeForTab('tab-active')).toMatchObject({
      autoScrollEnabled: true,
    });
    hydrationRenderRuntime.scrollToBottom({ tabId: 'tab-active' });
    hydrationRenderRuntime.syncPaneScrollMetrics('tab-active', messagesEl);
    expect(hydrationRenderRuntime.requestAnimationFrame(() => undefined)).toBe(7);

    expect(transitionState.getCurrentConversation()).toEqual({
      id: 'conversation-active',
      titleGenerationStatus: 'pending',
    });
    transitionState.cancelTitleGeneration('conversation-active');
    await transitionState.clearPendingTitleGenerationStatus('conversation-active');

    transitionWriteback.resetBackgroundTaskIndicator();
    transitionWriteback.clearScheduledScrollToBottom();
    transitionWriteback.beginConversationHydration('tab-active');
    transitionWriteback.clearMessagesContainer();
    transitionWriteback.resetTurnState();
    transitionWriteback.endConversationHydration('tab-active');

    hydrationOutcomeRuntime.syncBackgroundTaskStateFromConversation(conversation);
    await hydrationOutcomeRuntime.renderMessages([]);

    expect(fixture.host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-active' });
    expect(fixture.host.syncPaneScrollMetrics).toHaveBeenCalledWith('tab-active', messagesEl);
    expect(fixture.host.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.host.cancelTitleGeneration).toHaveBeenCalledWith('conversation-active');
    expect(fixture.host.clearPendingTitleGenerationStatus).toHaveBeenCalledWith(
      'conversation-active',
    );
    expect(fixture.host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearScheduledScrollToBottom).toHaveBeenCalledTimes(1);
    expect(fixture.host.beginConversationHydration).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.host.endConversationHydration).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
    );
    expect(fixture.host.renderMessages).toHaveBeenCalledWith([]);
  });

  it('keeps the grouped ports late-bound to the latest hydration collaborators', async () => {
    const fixture = createFixture();
    const factoryHost = createConversationHydrationRuntimeViewHostFactoryHost(fixture.host);
    const hydrationRenderRuntime = factoryHost.getHydrationRenderRuntime();
    const hydrationOutcomeRuntime = factoryHost.getHydrationOutcomeRuntime();
    const transitionState = factoryHost.getConversationTransitionState();
    const transitionWriteback = factoryHost.getConversationTransitionWriteback();
    const nextMessagesContainer = {} as HTMLElement;

    fixture.setMessagesContainer(nextMessagesContainer);
    fixture.setActiveTabId('tab-next');
    fixture.setScrollRuntime({ autoScrollEnabled: false } as ScrollRuntimeState);
    fixture.setCurrentConversation({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });
    fixture.host.requestAnimationFrame.mockReturnValue(11);

    expect(hydrationRenderRuntime.getMessagesContainer()).toBe(nextMessagesContainer);
    expect(hydrationRenderRuntime.getActiveTabId()).toBe('tab-next');
    expect(hydrationRenderRuntime.getScrollRuntimeForTab('tab-next')).toMatchObject({
      autoScrollEnabled: false,
    });
    expect(hydrationRenderRuntime.requestAnimationFrame(() => undefined)).toBe(11);
    expect(transitionState.getCurrentConversation()).toEqual({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });
    transitionWriteback.clearMessagesContainer();
    await hydrationOutcomeRuntime.renderMessages([]);

    expect(fixture.host.getMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.host.getScrollRuntimeForTab).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.host.getCurrentConversation).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.renderMessages).toHaveBeenCalledWith([]);
  });
});
