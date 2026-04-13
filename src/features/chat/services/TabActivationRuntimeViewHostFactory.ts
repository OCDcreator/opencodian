import {
  createTabActivationRuntimeBridgeHosts,
  type TabActivationRuntimeBridgeHosts,
  type TabActivationRuntimeHostAdapterHost,
} from '../runtime/TabActivationRuntimeHostAdapter';
import type {
  TabActivationConversationSyncRuntimePort,
} from './TabActivationConversationSyncPortProvider';

type TabActivationRuntimeTabPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'getTabManager'
  | 'getActiveTabId'
  | 'getSessionIdForTab'
  | 'getTabRuntimeState'
  | 'getTabMessagesContainer'
>;

type TabActivationConversationStatePort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'setCurrentConversation'
  | 'setCurrentConversationRevertState'
  | 'setOpenCodeSessionId'
>;

type TabActivationQuestionTodoPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'clearPendingQuestionsForTab'
  | 'resetTabSessionState'
  | 'clearTabSessionState'
>;

type TabActivationBackgroundTaskPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'resetBackgroundTaskSuppressedFingerprint'
  | 'hasBackgroundTaskIndicator'
>;

type TabActivationConversationSyncPort = TabActivationConversationSyncRuntimePort;

type TabActivationViewWritebackPort = Pick<
  TabActivationRuntimeHostAdapterHost,
  | 'updateSendButtonState'
  | 'setActiveMessagesPane'
  | 'scheduleComposerLayoutSync'
  | 'updateModelSelectorDisplay'
  | 'clearMessagesContainer'
  | 'resetTurnState'
  | 'scheduleSettledScrollToBottom'
>;

export interface TabActivationRuntimeViewHostFactoryHost {
  getTabRuntime(): TabActivationRuntimeTabPort;
  getConversationState(): TabActivationConversationStatePort;
  getQuestionTodoRuntime(): TabActivationQuestionTodoPort;
  getBackgroundTaskRuntime(): TabActivationBackgroundTaskPort;
  getConversationSyncRuntime(): TabActivationConversationSyncPort;
  getViewWriteback(): TabActivationViewWritebackPort;
}

export function createTabActivationRuntimeViewHosts(
  host: TabActivationRuntimeViewHostFactoryHost,
): TabActivationRuntimeBridgeHosts {
  return createTabActivationRuntimeBridgeHosts({
    getTabManager: () => host.getTabRuntime().getTabManager(),
    getActiveTabId: () => host.getTabRuntime().getActiveTabId(),
    getSessionIdForTab: (tabId) => host.getTabRuntime().getSessionIdForTab(tabId),
    setCurrentConversation: (conversation) => {
      host.getConversationState().setCurrentConversation(conversation);
    },
    setCurrentConversationRevertState: (revertState) => {
      host.getConversationState().setCurrentConversationRevertState(revertState);
    },
    setOpenCodeSessionId: (sessionId) => {
      host.getConversationState().setOpenCodeSessionId(sessionId);
    },
    clearPendingQuestionsForTab: (tabId) => {
      host.getQuestionTodoRuntime().clearPendingQuestionsForTab(tabId);
    },
    resetTabSessionState: (tabId, sessionId) => {
      host.getQuestionTodoRuntime().resetTabSessionState(tabId, sessionId);
    },
    clearTabSessionState: (tabId) => {
      host.getQuestionTodoRuntime().clearTabSessionState(tabId);
    },
    resetBackgroundTaskSuppressedFingerprint: (tabId) => {
      host.getBackgroundTaskRuntime().resetBackgroundTaskSuppressedFingerprint(tabId);
    },
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncRuntime().getConversationSyncFingerprint(messages),
    setLastConversationSyncFingerprint: (fingerprint) => {
      host.getConversationSyncRuntime().setLastConversationSyncFingerprint(fingerprint);
    },
    startConversationSyncLoop: () => {
      host.getConversationSyncRuntime().startConversationSyncLoop();
    },
    stopConversationSyncLoop: () => {
      host.getConversationSyncRuntime().stopConversationSyncLoop();
    },
    getTabRuntimeState: (tabId) => host.getTabRuntime().getTabRuntimeState(tabId),
    getTabMessagesContainer: (tabId) => host.getTabRuntime().getTabMessagesContainer(tabId),
    hasBackgroundTaskIndicator: (tabId) =>
      host.getBackgroundTaskRuntime().hasBackgroundTaskIndicator(tabId),
    updateSendButtonState: () => {
      host.getViewWriteback().updateSendButtonState();
    },
    setActiveMessagesPane: (tabId) => {
      host.getViewWriteback().setActiveMessagesPane(tabId);
    },
    scheduleComposerLayoutSync: () => {
      host.getViewWriteback().scheduleComposerLayoutSync();
    },
    updateModelSelectorDisplay: () => {
      host.getViewWriteback().updateModelSelectorDisplay();
    },
    clearMessagesContainer: () => {
      host.getViewWriteback().clearMessagesContainer();
    },
    resetTurnState: () => {
      host.getViewWriteback().resetTurnState();
    },
    scheduleSettledScrollToBottom: (tabId) => {
      host.getViewWriteback().scheduleSettledScrollToBottom(tabId);
    },
  });
}
