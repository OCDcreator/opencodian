import type {
  TabActivationRuntimeViewHostFactoryHost,
} from './TabActivationRuntimeViewHostFactory';

type TabActivationRuntimeTabPort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getTabRuntime']
>;
type TabActivationConversationStatePort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getConversationState']
>;
type TabActivationQuestionTodoPort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getQuestionTodoRuntime']
>;
type TabActivationBackgroundTaskPort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getBackgroundTaskRuntime']
>;
type TabActivationConversationSyncPort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getConversationSyncRuntime']
>;
type TabActivationViewWritebackPort = ReturnType<
  TabActivationRuntimeViewHostFactoryHost['getViewWriteback']
>;

export interface TabActivationRuntimeHostProviderHost {
  getTabManager: TabActivationRuntimeTabPort['getTabManager'];
  getActiveTabId: TabActivationRuntimeTabPort['getActiveTabId'];
  getSessionIdForTab: TabActivationRuntimeTabPort['getSessionIdForTab'];
  getTabRuntimeState: TabActivationRuntimeTabPort['getTabRuntimeState'];
  getTabMessagesContainer: TabActivationRuntimeTabPort['getTabMessagesContainer'];
  setCurrentConversation: TabActivationConversationStatePort['setCurrentConversation'];
  setCurrentConversationRevertState:
    TabActivationConversationStatePort['setCurrentConversationRevertState'];
  setOpenCodeSessionId: TabActivationConversationStatePort['setOpenCodeSessionId'];
  clearPendingQuestionsForTab:
    TabActivationQuestionTodoPort['clearPendingQuestionsForTab'];
  resetTabSessionState: TabActivationQuestionTodoPort['resetTabSessionState'];
  clearTabSessionState: TabActivationQuestionTodoPort['clearTabSessionState'];
  resetBackgroundTaskSuppressedFingerprint:
    TabActivationBackgroundTaskPort['resetBackgroundTaskSuppressedFingerprint'];
  hasBackgroundTaskIndicator:
    TabActivationBackgroundTaskPort['hasBackgroundTaskIndicator'];
  getConversationSyncFingerprint:
    TabActivationConversationSyncPort['getConversationSyncFingerprint'];
  setLastConversationSyncFingerprint:
    TabActivationConversationSyncPort['setLastConversationSyncFingerprint'];
  startConversationSyncLoop:
    TabActivationConversationSyncPort['startConversationSyncLoop'];
  stopConversationSyncLoop:
    TabActivationConversationSyncPort['stopConversationSyncLoop'];
  updateSendButtonState: TabActivationViewWritebackPort['updateSendButtonState'];
  setActiveMessagesPane: TabActivationViewWritebackPort['setActiveMessagesPane'];
  scheduleComposerLayoutSync:
    TabActivationViewWritebackPort['scheduleComposerLayoutSync'];
  updateModelSelectorDisplay:
    TabActivationViewWritebackPort['updateModelSelectorDisplay'];
  clearMessagesContainer: TabActivationViewWritebackPort['clearMessagesContainer'];
  resetTurnState: TabActivationViewWritebackPort['resetTurnState'];
  scheduleSettledScrollToBottom:
    TabActivationViewWritebackPort['scheduleSettledScrollToBottom'];
}

export function createTabActivationRuntimeViewHostFactoryHost(
  host: TabActivationRuntimeHostProviderHost,
): TabActivationRuntimeViewHostFactoryHost {
  return {
    getTabRuntime: () => ({
      getTabManager: () => host.getTabManager(),
      getActiveTabId: () => host.getActiveTabId(),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getTabMessagesContainer: (tabId) => host.getTabMessagesContainer(tabId),
    }),
    getConversationState: () => ({
      setCurrentConversation: (conversation) => {
        host.setCurrentConversation(conversation);
      },
      setCurrentConversationRevertState: (revertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
      setOpenCodeSessionId: (sessionId) => {
        host.setOpenCodeSessionId(sessionId);
      },
    }),
    getQuestionTodoRuntime: () => ({
      clearPendingQuestionsForTab: (tabId) => {
        host.clearPendingQuestionsForTab(tabId);
      },
      resetTabSessionState: (tabId, sessionId) => {
        host.resetTabSessionState(tabId, sessionId);
      },
      clearTabSessionState: (tabId) => {
        host.clearTabSessionState(tabId);
      },
    }),
    getBackgroundTaskRuntime: () => ({
      resetBackgroundTaskSuppressedFingerprint: (tabId) => {
        host.resetBackgroundTaskSuppressedFingerprint(tabId);
      },
      hasBackgroundTaskIndicator: (tabId) => host.hasBackgroundTaskIndicator(tabId),
    }),
    getConversationSyncRuntime: () => ({
      getConversationSyncFingerprint: (messages) =>
        host.getConversationSyncFingerprint(messages),
      setLastConversationSyncFingerprint: (fingerprint) => {
        host.setLastConversationSyncFingerprint(fingerprint);
      },
      startConversationSyncLoop: () => {
        host.startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        host.stopConversationSyncLoop();
      },
    }),
    getViewWriteback: () => ({
      updateSendButtonState: () => {
        host.updateSendButtonState();
      },
      setActiveMessagesPane: (tabId) => {
        host.setActiveMessagesPane(tabId);
      },
      scheduleComposerLayoutSync: () => {
        host.scheduleComposerLayoutSync();
      },
      updateModelSelectorDisplay: () => {
        host.updateModelSelectorDisplay();
      },
      clearMessagesContainer: () => {
        host.clearMessagesContainer();
      },
      resetTurnState: () => {
        host.resetTurnState();
      },
      scheduleSettledScrollToBottom: (tabId) => {
        host.scheduleSettledScrollToBottom(tabId);
      },
    }),
  };
}
