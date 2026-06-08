import {
  emitPromptSuggestionSessionChange,
  findPromptSuggestionScope,
} from '../../../core/agents/backend/promptSuggestionSink';
import { getConversationBackendSessionId } from '../../../core/types';
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
  applyConversationSessionSettings:
    TabActivationConversationStatePort['applyConversationSessionSettings'];
  clearPendingQuestionsForTab:
    TabActivationQuestionTodoPort['clearPendingQuestionsForTab'];
  resetTabSessionState: TabActivationQuestionTodoPort['resetTabSessionState'];
  clearTabSessionState: TabActivationQuestionTodoPort['clearTabSessionState'];
  resetBackgroundTaskSuppressedFingerprint:
    TabActivationBackgroundTaskPort['resetBackgroundTaskSuppressedFingerprint'];
  hasBackgroundTaskIndicator:
    TabActivationBackgroundTaskPort['hasBackgroundTaskIndicator'];
  getConversationSyncRuntime(): TabActivationConversationSyncPort;
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

        // Emit session change through the prompt suggestion channel bus
        const sessionId = conversation
          ? getConversationBackendSessionId(conversation) ?? null
          : null;
        const activeTabId = host.getActiveTabId();
        const messagesContainer = host.getTabMessagesContainer(activeTabId);
        if (messagesContainer && messagesContainer instanceof Element) {
          const channelId = findPromptSuggestionScope(messagesContainer);
          if (channelId) {
            emitPromptSuggestionSessionChange(sessionId, channelId);
          }
        }
      },
      setCurrentConversationRevertState: (revertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
      setOpenCodeSessionId: (sessionId) => {
        host.setOpenCodeSessionId(sessionId);
      },
      applyConversationSessionSettings: (conversation) => {
        host.applyConversationSessionSettings(conversation);
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
    getConversationSyncRuntime: () => host.getConversationSyncRuntime(),
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
