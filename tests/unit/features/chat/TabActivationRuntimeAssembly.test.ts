import type { Conversation } from '../../../../src/core/types';
import type { TabActivationRuntimeHostProviderHost } from '../../../../src/features/chat/services/TabActivationRuntimeHostProvider';
import {
  createTabActivationRuntimeAssembly,
  type TabActivationRuntimeAssemblyDeps,
} from '../../../../src/features/chat/services/TabActivationRuntimeViewHostFactory';

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

function createHostProviderHost() {
  const tabManager: TabManager = {
    setActiveTabConversation: jest.fn(),
    setTabStreaming: jest.fn(),
    setTabBackgroundTaskRunning: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
  let activeTabId = 'tab-active';
  const tabRuntimeState: TabRuntimeState = { isStreaming: false };
  const messagesContainer: ParentNode | null = document.createElement('div');
  const conversationSyncRuntime: Mocked<ConversationSyncRuntime> = {
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fp-1'),
    setLastConversationSyncFingerprint: jest.fn(),
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
  };
  const host: Mocked<TabActivationRuntimeHostProviderHost> = {
    getTabManager: jest.fn(() => tabManager),
    getActiveTabId: jest.fn(() => activeTabId),
    getSessionIdForTab: jest.fn((tabId) => `session-${tabId}`),
    getTabRuntimeState: jest.fn(() => tabRuntimeState),
    getTabMessagesContainer: jest.fn(() => messagesContainer),
    setCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setOpenCodeSessionId: jest.fn(),
    applyConversationSessionSettings: jest.fn(),
    clearPendingQuestionsForTab: jest.fn(),
    resetTabSessionState: jest.fn(),
    clearTabSessionState: jest.fn(),
    resetBackgroundTaskSuppressedFingerprint: jest.fn(),
    hasBackgroundTaskIndicator: jest.fn().mockReturnValue(false),
    getConversationSyncRuntime: jest.fn(() => conversationSyncRuntime),
    updateSendButtonState: jest.fn(),
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    scheduleSettledScrollToBottom: jest.fn(),
  };
  return { host, setActiveTabId: (id: string) => { activeTabId = id; } };
}

function createAssemblyDeps(): TabActivationRuntimeAssemblyDeps {
  return {
    hostProviderHost: createHostProviderHost().host,
    focusPreviewRefresh: { refreshActiveFocusContextPreview: jest.fn() },
    questionTodoActivationRefresh: {
      applyActivationPreflight: jest.fn(),
      applyConversationActivation: jest.fn(),
      applyEmptyActivation: jest.fn(),
    },
    backgroundTaskActivationIndicator: {
      prepareOpenConversation: jest.fn(),
      syncOpenConversationState: jest.fn(),
      renderLoadedConversationIndicator: jest.fn(),
      renderOpenConversationIndicator: jest.fn(),
    },
    activeTabContextUsage: {
      syncIdentity: jest.fn(),
      refreshFromServer: jest.fn(),
    },
  };
}

describe('createTabActivationRuntimeAssembly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('assembles all four tab activation bridges from flat deps', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);

    expect(assembly.tabConversationStateBridge).toBeDefined();
    expect(assembly.tabViewActivationBridge).toBeDefined();
    expect(assembly.tabConversationActivationBridge).toBeDefined();
    expect(assembly.tabRuntimeStateBridge).toBeDefined();
  });

  it('tabConversationStateBridge delegates to host provider', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);
    const conversation = createConversation('conv-1');

    assembly.tabConversationStateBridge.applyActiveConversation('tab-active', conversation);

    expect(deps.hostProviderHost.setCurrentConversation).toHaveBeenCalledWith(conversation);
  });

  it('tabViewActivationBridge calls focus preview refresh on preflight', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);

    assembly.tabViewActivationBridge.applyActivationPreflight('tab-active');

    expect(deps.focusPreviewRefresh.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(deps.hostProviderHost.setActiveMessagesPane).toHaveBeenCalledWith('tab-active');
  });

  it('tabViewActivationBridge delegates streaming activation outcome to coordinators', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);

    assembly.tabViewActivationBridge.applyStreamingActivationOutcome('tab-active', 'session-1');

    expect(deps.activeTabContextUsage.syncIdentity).toHaveBeenCalledTimes(1);
    expect(deps.questionTodoActivationRefresh.applyConversationActivation).toHaveBeenCalledWith(
      'tab-active',
      'session-1',
    );
  });

  it('tabViewActivationBridge delegates empty activation outcome', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);

    assembly.tabViewActivationBridge.applyEmptyActivationOutcome('tab-active');

    expect(deps.questionTodoActivationRefresh.applyEmptyActivation).toHaveBeenCalledWith(
      'tab-active',
    );
  });

  it('tabConversationActivationBridge delegates to state bridge for conversation activation', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);
    const conversation = createConversation('conv-2');

    assembly.tabConversationActivationBridge.openConversation(conversation);

    expect(deps.hostProviderHost.setCurrentConversation).toHaveBeenCalledWith(conversation);
  });

  it('tabRuntimeStateBridge delegates syncStreamLikeState to host provider', () => {
    const deps = createAssemblyDeps();
    const assembly = createTabActivationRuntimeAssembly(deps);

    assembly.tabRuntimeStateBridge.syncStreamLikeState('tab-active');

    expect(deps.hostProviderHost.getTabRuntimeState).toHaveBeenCalledWith('tab-active');
    expect(deps.hostProviderHost.updateSendButtonState).toHaveBeenCalledTimes(1);
  });
});
