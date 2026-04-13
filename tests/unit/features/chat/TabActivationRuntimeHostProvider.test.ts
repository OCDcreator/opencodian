import type { Conversation } from '../../../../src/core/types';
import {
  createTabActivationRuntimeViewHostFactoryHost,
  type TabActivationRuntimeHostProviderHost,
} from '../../../../src/features/chat/services/TabActivationRuntimeHostProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type TabManager = ReturnType<TabActivationRuntimeHostProviderHost['getTabManager']>;
type TabRuntimeState = ReturnType<TabActivationRuntimeHostProviderHost['getTabRuntimeState']>;
type ConversationSyncRuntime = ReturnType<
  TabActivationRuntimeHostProviderHost['getConversationSyncRuntime']
>;

function createConversation(id: string): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    openCodeSessionId: `session-${id}`,
  };
}

function createFixture() {
  let tabManager: TabManager = {
    setActiveTabConversation: jest.fn(),
    setTabStreaming: jest.fn(),
    setTabBackgroundTaskRunning: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
  let activeTabId = 'tab-active';
  let tabRuntimeState: TabRuntimeState = { isStreaming: true };
  let messagesContainer = {} as ParentNode;
  const initialConversationSyncRuntime: Mocked<ConversationSyncRuntime> = {
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint-active'),
    setLastConversationSyncFingerprint: jest.fn(),
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
  };
  let conversationSyncRuntime = initialConversationSyncRuntime;
  const host: Mocked<TabActivationRuntimeHostProviderHost> = {
    getTabManager: jest.fn(() => tabManager),
    getActiveTabId: jest.fn(() => activeTabId),
    getSessionIdForTab: jest.fn((tabId: string | null) => `session-${tabId}`),
    getTabRuntimeState: jest.fn(() => tabRuntimeState),
    getTabMessagesContainer: jest.fn(() => messagesContainer),
    setCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setOpenCodeSessionId: jest.fn(),
    clearPendingQuestionsForTab: jest.fn(),
    resetTabSessionState: jest.fn(),
    clearTabSessionState: jest.fn(),
    resetBackgroundTaskSuppressedFingerprint: jest.fn(),
    hasBackgroundTaskIndicator: jest.fn().mockReturnValue(true),
    getConversationSyncRuntime: jest.fn(() => conversationSyncRuntime),
    updateSendButtonState: jest.fn(),
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    scheduleSettledScrollToBottom: jest.fn(),
  };

  return {
    host,
    initialConversationSyncRuntime,
    setTabManager: (next: TabManager) => {
      tabManager = next;
    },
    setActiveTabId: (next: string) => {
      activeTabId = next;
    },
    setTabRuntimeState: (next: TabRuntimeState) => {
      tabRuntimeState = next;
    },
    setMessagesContainer: (next: ParentNode) => {
      messagesContainer = next;
    },
    setConversationSyncRuntime: (next: Mocked<ConversationSyncRuntime>) => {
      conversationSyncRuntime = next;
    },
  };
}

describe('TabActivationRuntimeHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin activation seam into the existing factory host ports', () => {
    const fixture = createFixture();
    const factoryHost = createTabActivationRuntimeViewHostFactoryHost(fixture.host);
    const tabRuntime = factoryHost.getTabRuntime();
    const conversationState = factoryHost.getConversationState();
    const questionTodoRuntime = factoryHost.getQuestionTodoRuntime();
    const backgroundTaskRuntime = factoryHost.getBackgroundTaskRuntime();
    const conversationSyncRuntime = factoryHost.getConversationSyncRuntime();
    const viewWriteback = factoryHost.getViewWriteback();
    const conversation = createConversation('conversation-next');

    expect(tabRuntime.getTabManager()).toBe(fixture.host.getTabManager.mock.results[0].value);
    expect(tabRuntime.getActiveTabId()).toBe('tab-active');
    expect(tabRuntime.getSessionIdForTab('tab-active')).toBe('session-tab-active');
    expect(tabRuntime.getTabRuntimeState('tab-active')).toEqual({ isStreaming: true });
    expect(tabRuntime.getTabMessagesContainer('tab-active')).toEqual({});

    conversationState.setCurrentConversation(conversation);
    conversationState.setCurrentConversationRevertState(null);
    conversationState.setOpenCodeSessionId('session-next');

    questionTodoRuntime.clearPendingQuestionsForTab('tab-active');
    questionTodoRuntime.resetTabSessionState('tab-active', 'session-next');
    questionTodoRuntime.clearTabSessionState('tab-active');

    backgroundTaskRuntime.resetBackgroundTaskSuppressedFingerprint('tab-active');
    expect(backgroundTaskRuntime.hasBackgroundTaskIndicator('tab-active')).toBe(true);

    expect(conversationSyncRuntime.getConversationSyncFingerprint([])).toBe(
      'fingerprint-active',
    );
    conversationSyncRuntime.setLastConversationSyncFingerprint('fingerprint-next');
    conversationSyncRuntime.startConversationSyncLoop();
    conversationSyncRuntime.stopConversationSyncLoop();

    viewWriteback.updateSendButtonState();
    viewWriteback.setActiveMessagesPane('tab-active');
    viewWriteback.scheduleComposerLayoutSync();
    viewWriteback.updateModelSelectorDisplay();
    viewWriteback.clearMessagesContainer();
    viewWriteback.resetTurnState();
    viewWriteback.scheduleSettledScrollToBottom('tab-active');

    expect(fixture.host.setCurrentConversation).toHaveBeenCalledWith(conversation);
    expect(fixture.host.setCurrentConversationRevertState).toHaveBeenCalledWith(null);
    expect(fixture.host.setOpenCodeSessionId).toHaveBeenCalledWith('session-next');
    expect(fixture.host.clearPendingQuestionsForTab).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetTabSessionState).toHaveBeenCalledWith(
      'tab-active',
      'session-next',
    );
    expect(fixture.host.clearTabSessionState).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.resetBackgroundTaskSuppressedFingerprint).toHaveBeenCalledWith(
      'tab-active',
    );
    expect(fixture.host.hasBackgroundTaskIndicator).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.getConversationSyncRuntime).toHaveBeenCalledTimes(1);
    expect(fixture.initialConversationSyncRuntime.getConversationSyncFingerprint)
      .toHaveBeenCalledWith([]);
    expect(fixture.initialConversationSyncRuntime.setLastConversationSyncFingerprint)
      .toHaveBeenCalledWith(
      'fingerprint-next',
    );
    expect(fixture.initialConversationSyncRuntime.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialConversationSyncRuntime.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.host.updateSendButtonState).toHaveBeenCalledTimes(1);
    expect(fixture.host.setActiveMessagesPane).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(fixture.host.updateModelSelectorDisplay).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.host.scheduleSettledScrollToBottom).toHaveBeenCalledWith('tab-active');
  });

  it('keeps the grouped ports late-bound to the latest activation collaborators', () => {
    const fixture = createFixture();
    const factoryHost = createTabActivationRuntimeViewHostFactoryHost(fixture.host);
    const tabRuntime = factoryHost.getTabRuntime();
    const viewWriteback = factoryHost.getViewWriteback();
    const nextConversationSyncRuntime: Mocked<ConversationSyncRuntime> = {
      getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint-next'),
      setLastConversationSyncFingerprint: jest.fn(),
      startConversationSyncLoop: jest.fn(),
      stopConversationSyncLoop: jest.fn(),
    };
    const nextTabManager: TabManager = {
      setActiveTabConversation: jest.fn(),
      setTabStreaming: jest.fn(),
      setTabBackgroundTaskRunning: jest.fn(),
      setTabNeedsAttention: jest.fn(),
    };

    fixture.setTabManager(nextTabManager);
    fixture.setActiveTabId('tab-next');
    fixture.setTabRuntimeState({ isStreaming: false });
    fixture.setMessagesContainer(document.createElement('div'));
    fixture.setConversationSyncRuntime(nextConversationSyncRuntime);

    expect(tabRuntime.getTabManager()).toBe(nextTabManager);
    expect(tabRuntime.getActiveTabId()).toBe('tab-next');
    expect(tabRuntime.getTabRuntimeState('tab-next')).toEqual({ isStreaming: false });
    expect(tabRuntime.getTabMessagesContainer('tab-next')).toBeInstanceOf(HTMLDivElement);
    expect(factoryHost.getConversationSyncRuntime()).toBe(nextConversationSyncRuntime);

    viewWriteback.updateSendButtonState();

    expect(fixture.host.getTabManager).toHaveBeenCalledTimes(1);
    expect(fixture.host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.host.getTabRuntimeState).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.getTabMessagesContainer).toHaveBeenCalledWith('tab-next');
    expect(fixture.host.getConversationSyncRuntime).toHaveBeenCalledTimes(1);
    expect(fixture.host.updateSendButtonState).toHaveBeenCalledTimes(1);
  });
});
