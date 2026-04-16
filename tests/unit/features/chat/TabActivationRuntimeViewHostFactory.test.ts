import type { Conversation } from '../../../../src/core/types';
import {
  createTabActivationRuntimeViewHosts,
  type TabActivationRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/TabActivationRuntimeViewHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type TabRuntimePort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getTabRuntime']>;
type ConversationStatePort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getConversationState']>;
type QuestionTodoPort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getQuestionTodoRuntime']>;
type BackgroundTaskPort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getBackgroundTaskRuntime']>;
type ConversationSyncPort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getConversationSyncRuntime']>;
type ViewWritebackPort = ReturnType<TabActivationRuntimeViewHostFactoryHost['getViewWriteback']>;

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

function createTabRuntimePort(activeTabId: string): Mocked<TabRuntimePort> {
  const tabManager = {
    setActiveTabConversation: jest.fn(),
    setTabStreaming: jest.fn(),
    setTabBackgroundTaskRunning: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };

  return {
    getTabManager: jest.fn().mockReturnValue(tabManager),
    getActiveTabId: jest.fn().mockReturnValue(activeTabId),
    getSessionIdForTab: jest.fn().mockReturnValue(`session-${activeTabId}`),
    getTabRuntimeState: jest.fn().mockReturnValue({ isStreaming: true }),
    getTabMessagesContainer: jest.fn().mockReturnValue({} as ParentNode),
  };
}

function createConversationStatePort(): Mocked<ConversationStatePort> {
  return {
    setCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setOpenCodeSessionId: jest.fn(),
  };
}

function createQuestionTodoPort(): Mocked<QuestionTodoPort> {
  return {
    clearPendingQuestionsForTab: jest.fn(),
    resetTabSessionState: jest.fn(),
    clearTabSessionState: jest.fn(),
  };
}

function createBackgroundTaskPort(hasIndicator: boolean): Mocked<BackgroundTaskPort> {
  return {
    resetBackgroundTaskSuppressedFingerprint: jest.fn(),
    hasBackgroundTaskIndicator: jest.fn().mockReturnValue(hasIndicator),
  };
}

function createConversationSyncPort(fingerprint: string): Mocked<ConversationSyncPort> {
  return {
    getConversationSyncFingerprint: jest.fn().mockReturnValue(fingerprint),
    setLastConversationSyncFingerprint: jest.fn(),
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
  };
}

function createViewWritebackPort(): Mocked<ViewWritebackPort> {
  return {
    updateSendButtonState: jest.fn(),
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    scheduleSettledScrollToBottom: jest.fn(),
  };
}

function createFixture() {
  const initialTabRuntime = createTabRuntimePort('tab-active');
  const initialConversationState = createConversationStatePort();
  const initialQuestionTodo = createQuestionTodoPort();
  const initialBackgroundTask = createBackgroundTaskPort(true);
  const initialConversationSync = createConversationSyncPort('fingerprint-initial');
  const initialViewWriteback = createViewWritebackPort();
  let tabRuntime = initialTabRuntime;
  let conversationState = initialConversationState;
  let questionTodo = initialQuestionTodo;
  let backgroundTask = initialBackgroundTask;
  let conversationSync = initialConversationSync;
  let viewWriteback = initialViewWriteback;

  const host: Mocked<TabActivationRuntimeViewHostFactoryHost> = {
    getTabRuntime: jest.fn(() => tabRuntime),
    getConversationState: jest.fn(() => conversationState),
    getQuestionTodoRuntime: jest.fn(() => questionTodo),
    getBackgroundTaskRuntime: jest.fn(() => backgroundTask),
    getConversationSyncRuntime: jest.fn(() => conversationSync),
    getViewWriteback: jest.fn(() => viewWriteback),
  };

  return {
    host,
    initialBackgroundTask,
    initialConversationState,
    initialConversationSync,
    initialQuestionTodo,
    initialTabRuntime,
    initialViewWriteback,
    setBackgroundTask: (next: Mocked<BackgroundTaskPort>) => {
      backgroundTask = next;
    },
    setConversationState: (next: Mocked<ConversationStatePort>) => {
      conversationState = next;
    },
    setConversationSync: (next: Mocked<ConversationSyncPort>) => {
      conversationSync = next;
    },
    setQuestionTodo: (next: Mocked<QuestionTodoPort>) => {
      questionTodo = next;
    },
    setTabRuntime: (next: Mocked<TabRuntimePort>) => {
      tabRuntime = next;
    },
    setViewWriteback: (next: Mocked<ViewWritebackPort>) => {
      viewWriteback = next;
    },
  };
}

describe('TabActivationRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives activation runtime hosts from grouped view ports', () => {
    const fixture = createFixture();
    const conversation = createConversation('loaded');
    const {
      tabActivationBridgeHosts,
      tabConversationStateBridgeHost,
      tabRuntimeStateBridgeHost,
    } = createTabActivationRuntimeViewHosts(fixture.host);

    expect(tabConversationStateBridgeHost.getTabManager()).toBe(
      fixture.initialTabRuntime.getTabManager.mock.results[0].value,
    );
    expect(tabConversationStateBridgeHost.getSessionIdForTab('tab-active')).toBe(
      'session-tab-active',
    );
    tabConversationStateBridgeHost.setCurrentConversation(conversation);
    tabConversationStateBridgeHost.setCurrentConversationRevertState(null);
    tabConversationStateBridgeHost.setOpenCodeSessionId('session-loaded');
    tabConversationStateBridgeHost.clearPendingQuestionsForTab('tab-active');
    tabConversationStateBridgeHost.resetTabSessionState('tab-active', 'session-loaded');
    tabConversationStateBridgeHost.clearTabSessionState('tab-active');
    tabConversationStateBridgeHost.resetBackgroundTaskSuppressedFingerprint('tab-active');
    expect(tabConversationStateBridgeHost.getConversationSyncFingerprint([])).toBe(
      'fingerprint-initial',
    );
    tabConversationStateBridgeHost.setLastConversationSyncFingerprint('fingerprint-next');
    tabConversationStateBridgeHost.startConversationSyncLoop();
    tabConversationStateBridgeHost.stopConversationSyncLoop();

    expect(tabRuntimeStateBridgeHost.getActiveTabId()).toBe('tab-active');
    expect(tabRuntimeStateBridgeHost.getTabRuntimeState('tab-active')).toEqual({
      isStreaming: true,
    });
    expect(tabRuntimeStateBridgeHost.getTabMessagesContainer('tab-active')).toEqual({});
    expect(tabRuntimeStateBridgeHost.hasBackgroundTaskIndicator('tab-active')).toBe(true);
    tabRuntimeStateBridgeHost.updateSendButtonState();

    tabActivationBridgeHosts.tabViewActivationBridgeHost.setActiveMessagesPane('tab-active');
    tabActivationBridgeHosts.tabViewActivationBridgeHost.scheduleComposerLayoutSync();
    tabActivationBridgeHosts.tabViewActivationBridgeHost.updateModelSelectorDisplay();
    tabActivationBridgeHosts.tabViewActivationBridgeHost.updateSendButtonState();
    expect(tabActivationBridgeHosts.tabConversationActivationBridgeHost.getActiveTabId()).toBe(
      'tab-active',
    );
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.clearMessagesContainer();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.resetTurnState();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.updateModelSelectorDisplay();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.scheduleSettledScrollToBottom(
      'tab-active',
    );

    expect(fixture.initialConversationState.setCurrentConversation).toHaveBeenCalledWith(
      conversation,
    );
    expect(fixture.initialConversationState.setCurrentConversationRevertState)
      .toHaveBeenCalledWith(null);
    expect(fixture.initialConversationState.setOpenCodeSessionId).toHaveBeenCalledWith(
      'session-loaded',
    );
    expect(fixture.initialQuestionTodo.clearPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
    );
    expect(fixture.initialQuestionTodo.resetTabSessionState).toHaveBeenCalledWith(
      'tab-active',
      'session-loaded',
    );
    expect(fixture.initialQuestionTodo.clearTabSessionState).toHaveBeenCalledWith('tab-active');
    expect(fixture.initialBackgroundTask.resetBackgroundTaskSuppressedFingerprint)
      .toHaveBeenCalledWith('tab-active');
    expect(fixture.initialConversationSync.getConversationSyncFingerprint)
      .toHaveBeenCalledWith([]);
    expect(fixture.initialConversationSync.setLastConversationSyncFingerprint)
      .toHaveBeenCalledWith('fingerprint-next');
    expect(fixture.initialConversationSync.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialConversationSync.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialViewWriteback.setActiveMessagesPane).toHaveBeenCalledWith('tab-active');
    expect(fixture.initialViewWriteback.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(fixture.initialViewWriteback.updateModelSelectorDisplay).toHaveBeenCalledTimes(2);
    expect(fixture.initialViewWriteback.updateSendButtonState).toHaveBeenCalledTimes(2);
    expect(fixture.initialViewWriteback.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(fixture.initialViewWriteback.resetTurnState).toHaveBeenCalledTimes(1);
    expect(fixture.initialViewWriteback.scheduleSettledScrollToBottom)
      .toHaveBeenCalledWith('tab-active');
  });

  it('uses the latest port returned by the view host', () => {
    const fixture = createFixture();
    const {
      tabConversationStateBridgeHost,
      tabRuntimeStateBridgeHost,
    } = createTabActivationRuntimeViewHosts(fixture.host);
    const nextTabRuntime = createTabRuntimePort('tab-next');
    const nextConversationState = createConversationStatePort();

    fixture.setTabRuntime(nextTabRuntime);
    fixture.setConversationState(nextConversationState);

    expect(tabRuntimeStateBridgeHost.getActiveTabId()).toBe('tab-next');
    tabConversationStateBridgeHost.setOpenCodeSessionId('session-next');

    expect(fixture.initialTabRuntime.getActiveTabId).not.toHaveBeenCalled();
    expect(nextTabRuntime.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(fixture.initialConversationState.setOpenCodeSessionId).not.toHaveBeenCalled();
    expect(nextConversationState.setOpenCodeSessionId).toHaveBeenCalledWith('session-next');
  });
});
