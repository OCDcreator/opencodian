import {
  createTabActivationRuntimeBridgeHosts,
  type TabActivationRuntimeHostAdapterHost,
} from '../../../../src/features/chat/runtime/TabActivationRuntimeHostAdapter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHost(): Mocked<TabActivationRuntimeHostAdapterHost> {
  const tabManager = {
    setActiveTabConversation: jest.fn(),
    setTabStreaming: jest.fn(),
    setTabBackgroundTaskRunning: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };

  return {
    getTabManager: jest.fn().mockReturnValue(tabManager),
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    getSessionIdForTab: jest.fn().mockReturnValue('session-current'),
    setCurrentConversation: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setOpenCodeSessionId: jest.fn(),
    clearPendingQuestionsForTab: jest.fn(),
    resetTabSessionState: jest.fn(),
    clearTabSessionState: jest.fn(),
    resetBackgroundTaskSuppressedFingerprint: jest.fn(),
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint'),
    setLastConversationSyncFingerprint: jest.fn(),
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
    getTabRuntimeState: jest.fn().mockReturnValue({ isStreaming: true }),
    getTabMessagesContainer: jest.fn().mockReturnValue({} as ParentNode),
    hasBackgroundTaskIndicator: jest.fn().mockReturnValue(true),
    updateSendButtonState: jest.fn(),
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    scheduleSettledScrollToBottom: jest.fn(),
  };
}

describe('TabActivationRuntimeHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives activation, conversation-state, and runtime-state bridge hosts from one shared seam', () => {
    const host = createHost();
    const {
      tabActivationBridgeHosts,
      tabConversationStateBridgeHost,
      tabRuntimeStateBridgeHost,
    } = createTabActivationRuntimeBridgeHosts(host);

    tabConversationStateBridgeHost.getTabManager();
    expect(tabConversationStateBridgeHost.getSessionIdForTab('tab-1')).toBe('session-current');
    tabConversationStateBridgeHost.setCurrentConversation(null);
    tabConversationStateBridgeHost.setCurrentConversationRevertState(null);
    tabConversationStateBridgeHost.setOpenCodeSessionId('session-next');
    tabConversationStateBridgeHost.clearPendingQuestionsForTab('tab-1');
    tabConversationStateBridgeHost.resetTabSessionState('tab-1', 'session-next');
    tabConversationStateBridgeHost.clearTabSessionState('tab-1');
    tabConversationStateBridgeHost.resetBackgroundTaskSuppressedFingerprint('tab-1');
    expect(tabConversationStateBridgeHost.getConversationSyncFingerprint([])).toBe('fingerprint');
    tabConversationStateBridgeHost.setLastConversationSyncFingerprint('fingerprint-next');
    tabConversationStateBridgeHost.startConversationSyncLoop();
    tabConversationStateBridgeHost.stopConversationSyncLoop();

    tabRuntimeStateBridgeHost.getTabManager();
    expect(tabRuntimeStateBridgeHost.getActiveTabId()).toBe('tab-active');
    expect(tabRuntimeStateBridgeHost.getTabRuntimeState('tab-2')).toEqual({ isStreaming: true });
    expect(tabRuntimeStateBridgeHost.getTabMessagesContainer('tab-2')).toEqual({});
    expect(tabRuntimeStateBridgeHost.hasBackgroundTaskIndicator('tab-2')).toBe(true);
    tabRuntimeStateBridgeHost.updateSendButtonState();

    tabActivationBridgeHosts.tabViewActivationBridgeHost.setActiveMessagesPane('tab-1');
    tabActivationBridgeHosts.tabViewActivationBridgeHost.scheduleComposerLayoutSync();
    tabActivationBridgeHosts.tabViewActivationBridgeHost.updateModelSelectorDisplay();
    tabActivationBridgeHosts.tabViewActivationBridgeHost.updateSendButtonState();
    expect(tabActivationBridgeHosts.tabConversationActivationBridgeHost.getActiveTabId()).toBe('tab-active');
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.clearMessagesContainer();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.resetTurnState();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.updateModelSelectorDisplay();
    tabActivationBridgeHosts.tabConversationActivationBridgeHost.scheduleSettledScrollToBottom('tab-3');

    expect(host.getTabManager).toHaveBeenCalledTimes(2);
    expect(host.getSessionIdForTab).toHaveBeenCalledWith('tab-1');
    expect(host.setCurrentConversation).toHaveBeenCalledWith(null);
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith(null);
    expect(host.setOpenCodeSessionId).toHaveBeenCalledWith('session-next');
    expect(host.clearPendingQuestionsForTab).toHaveBeenCalledWith('tab-1');
    expect(host.resetTabSessionState).toHaveBeenCalledWith('tab-1', 'session-next');
    expect(host.clearTabSessionState).toHaveBeenCalledWith('tab-1');
    expect(host.resetBackgroundTaskSuppressedFingerprint).toHaveBeenCalledWith('tab-1');
    expect(host.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenCalledWith('fingerprint-next');
    expect(host.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(host.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(host.getActiveTabId).toHaveBeenCalledTimes(2);
    expect(host.getTabRuntimeState).toHaveBeenCalledWith('tab-2');
    expect(host.getTabMessagesContainer).toHaveBeenCalledWith('tab-2');
    expect(host.hasBackgroundTaskIndicator).toHaveBeenCalledWith('tab-2');
    expect(host.updateSendButtonState).toHaveBeenCalledTimes(2);
    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(host.updateModelSelectorDisplay).toHaveBeenCalledTimes(2);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(host.scheduleSettledScrollToBottom).toHaveBeenCalledWith('tab-3');
  });
});
