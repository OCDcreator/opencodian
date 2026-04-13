import {
  createConversationHydrationRuntimeViewHosts,
  type ConversationHydrationRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/ConversationHydrationRuntimeViewHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type HydrationRenderRuntimePort =
  ReturnType<ConversationHydrationRuntimeViewHostFactoryHost['getHydrationRenderRuntime']>;
type HydrationOutcomeRuntimePort =
  ReturnType<ConversationHydrationRuntimeViewHostFactoryHost['getHydrationOutcomeRuntime']>;
type TransitionStatePort =
  ReturnType<ConversationHydrationRuntimeViewHostFactoryHost['getConversationTransitionState']>;
type TransitionWritebackPort =
  ReturnType<ConversationHydrationRuntimeViewHostFactoryHost['getConversationTransitionWriteback']>;

function createHydrationRenderRuntimePort(): Mocked<HydrationRenderRuntimePort> {
  const messagesContainer = {} as HTMLElement;

  return {
    getMessagesContainer: jest.fn().mockReturnValue(messagesContainer),
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getScrollRuntimeForTab: jest.fn().mockReturnValue({ autoScrollEnabled: true }),
    scrollToBottom: jest.fn(),
    syncPaneScrollMetrics: jest.fn(),
    requestAnimationFrame: jest.fn().mockReturnValue(7),
  };
}

function createHydrationOutcomeRuntimePort(): Mocked<HydrationOutcomeRuntimePort> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(),
    renderMessages: jest.fn().mockResolvedValue(undefined),
  };
}

function createTransitionStatePort(): Mocked<TransitionStatePort> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue({
      id: 'conversation-current',
      titleGenerationStatus: 'pending',
    }),
    cancelTitleGeneration: jest.fn(),
    clearPendingTitleGenerationStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function createTransitionWritebackPort(): Mocked<TransitionWritebackPort> {
  return {
    resetBackgroundTaskIndicator: jest.fn(),
    clearScheduledScrollToBottom: jest.fn(),
    beginConversationHydration: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    endConversationHydration: jest.fn(),
  };
}

function createFixture() {
  const initialHydrationRenderRuntime = createHydrationRenderRuntimePort();
  const initialHydrationOutcomeRuntime = createHydrationOutcomeRuntimePort();
  const initialTransitionState = createTransitionStatePort();
  const initialTransitionWriteback = createTransitionWritebackPort();
  let hydrationRenderRuntime = initialHydrationRenderRuntime;
  let hydrationOutcomeRuntime = initialHydrationOutcomeRuntime;
  let transitionState = initialTransitionState;
  let transitionWriteback = initialTransitionWriteback;

  const host: Mocked<ConversationHydrationRuntimeViewHostFactoryHost> = {
    getHydrationRenderRuntime: jest.fn(() => hydrationRenderRuntime),
    getHydrationOutcomeRuntime: jest.fn(() => hydrationOutcomeRuntime),
    getConversationTransitionState: jest.fn(() => transitionState),
    getConversationTransitionWriteback: jest.fn(() => transitionWriteback),
  };

  return {
    host,
    initialHydrationOutcomeRuntime,
    initialHydrationRenderRuntime,
    initialTransitionState,
    initialTransitionWriteback,
    setHydrationOutcomeRuntime: (next: Mocked<HydrationOutcomeRuntimePort>) => {
      hydrationOutcomeRuntime = next;
    },
    setHydrationRenderRuntime: (next: Mocked<HydrationRenderRuntimePort>) => {
      hydrationRenderRuntime = next;
    },
    setTransitionState: (next: Mocked<TransitionStatePort>) => {
      transitionState = next;
    },
    setTransitionWriteback: (next: Mocked<TransitionWritebackPort>) => {
      transitionWriteback = next;
    },
  };
}

describe('ConversationHydrationRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives hydration and transition hosts from grouped view ports', async () => {
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
      HydrationOutcomeRuntimePort['syncBackgroundTaskStateFromConversation']
    >[0];
    const messages: Parameters<HydrationOutcomeRuntimePort['renderMessages']>[0] = [];
    const messagesEl = {} as HTMLElement;

    expect(conversationHydrationRenderBridgeHost.getMessagesContainer()).toBe(
      fixture.initialHydrationRenderRuntime.getMessagesContainer.mock.results[0].value,
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

    expect(fixture.initialHydrationRenderRuntime.scrollToBottom).toHaveBeenCalledWith({
      tabId: 'tab-active',
    });
    expect(fixture.initialHydrationRenderRuntime.syncPaneScrollMetrics)
      .toHaveBeenCalledWith('tab-active', messagesEl);
    expect(fixture.initialHydrationRenderRuntime.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionState.cancelTitleGeneration)
      .toHaveBeenCalledWith('conversation-current');
    expect(fixture.initialTransitionState.clearPendingTitleGenerationStatus)
      .toHaveBeenCalledWith('conversation-current');
    expect(fixture.initialTransitionWriteback.resetBackgroundTaskIndicator)
      .toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionWriteback.clearScheduledScrollToBottom)
      .toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionWriteback.beginConversationHydration)
      .toHaveBeenCalledWith('tab-active');
    expect(fixture.initialTransitionWriteback.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionWriteback.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionWriteback.endConversationHydration)
      .toHaveBeenCalledWith('tab-active');
    expect(fixture.initialHydrationOutcomeRuntime.syncBackgroundTaskStateFromConversation)
      .toHaveBeenCalledWith(conversation);
    expect(fixture.initialHydrationOutcomeRuntime.renderMessages).toHaveBeenCalledWith(messages);
  });

  it('uses the latest ports returned by the view host', async () => {
    const fixture = createFixture();
    const {
      conversationHydrationRenderBridgeHost,
      conversationHydrationOutcomeBridgeHost,
      conversationTransitionBridgeHost,
    } = createConversationHydrationRuntimeViewHosts(fixture.host);
    const nextHydrationRenderRuntime = createHydrationRenderRuntimePort();
    const nextHydrationOutcomeRuntime = createHydrationOutcomeRuntimePort();
    const nextTransitionState = createTransitionStatePort();
    const nextTransitionWriteback = createTransitionWritebackPort();
    nextHydrationRenderRuntime.getActiveTabId.mockReturnValue('tab-next');
    nextTransitionState.getCurrentConversation.mockReturnValue({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });

    fixture.setHydrationRenderRuntime(nextHydrationRenderRuntime);
    fixture.setHydrationOutcomeRuntime(nextHydrationOutcomeRuntime);
    fixture.setTransitionState(nextTransitionState);
    fixture.setTransitionWriteback(nextTransitionWriteback);

    expect(conversationHydrationRenderBridgeHost.getActiveTabId()).toBe('tab-next');
    expect(conversationTransitionBridgeHost.getCurrentConversation()).toEqual({
      id: 'conversation-next',
      titleGenerationStatus: undefined,
    });
    conversationTransitionBridgeHost.clearMessagesContainer();
    await conversationHydrationOutcomeBridgeHost.renderMessages([]);

    expect(fixture.initialHydrationRenderRuntime.getActiveTabId).not.toHaveBeenCalled();
    expect(nextHydrationRenderRuntime.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionState.getCurrentConversation).not.toHaveBeenCalled();
    expect(nextTransitionState.getCurrentConversation).toHaveBeenCalledTimes(1);
    expect(fixture.initialTransitionWriteback.clearMessagesContainer).not.toHaveBeenCalled();
    expect(nextTransitionWriteback.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.initialHydrationOutcomeRuntime.renderMessages).not.toHaveBeenCalled();
    expect(nextHydrationOutcomeRuntime.renderMessages).toHaveBeenCalledWith([]);
  });
});
