import type {
  ConversationHydrationRuntimeViewHostFactoryHost,
} from './ConversationHydrationRuntimeViewHostFactory';

type ConversationHydrationRenderRuntimePort = ReturnType<
  ConversationHydrationRuntimeViewHostFactoryHost['getHydrationRenderRuntime']
>;
type ConversationHydrationOutcomeRuntimePort = ReturnType<
  ConversationHydrationRuntimeViewHostFactoryHost['getHydrationOutcomeRuntime']
>;
type ConversationTransitionStatePort = ReturnType<
  ConversationHydrationRuntimeViewHostFactoryHost['getConversationTransitionState']
>;
type ConversationTransitionWritebackPort = ReturnType<
  ConversationHydrationRuntimeViewHostFactoryHost['getConversationTransitionWriteback']
>;

export interface ConversationHydrationRuntimeHostProviderHost {
  getMessagesContainer: ConversationHydrationRenderRuntimePort['getMessagesContainer'];
  getActiveTabId: ConversationHydrationRenderRuntimePort['getActiveTabId'];
  getScrollRuntimeForTab: ConversationHydrationRenderRuntimePort['getScrollRuntimeForTab'];
  scrollToBottom: ConversationHydrationRenderRuntimePort['scrollToBottom'];
  syncPaneScrollMetrics: ConversationHydrationRenderRuntimePort['syncPaneScrollMetrics'];
  requestAnimationFrame: ConversationHydrationRenderRuntimePort['requestAnimationFrame'];
  syncBackgroundTaskStateFromConversation:
    ConversationHydrationOutcomeRuntimePort['syncBackgroundTaskStateFromConversation'];
  renderMessages: ConversationHydrationOutcomeRuntimePort['renderMessages'];
  getCurrentConversation: ConversationTransitionStatePort['getCurrentConversation'];
  cancelTitleGeneration: ConversationTransitionStatePort['cancelTitleGeneration'];
  clearPendingTitleGenerationStatus:
    ConversationTransitionStatePort['clearPendingTitleGenerationStatus'];
  resetBackgroundTaskIndicator: ConversationTransitionWritebackPort['resetBackgroundTaskIndicator'];
  clearScheduledScrollToBottom:
    ConversationTransitionWritebackPort['clearScheduledScrollToBottom'];
  beginConversationHydration: ConversationTransitionWritebackPort['beginConversationHydration'];
  clearMessagesContainer: ConversationTransitionWritebackPort['clearMessagesContainer'];
  resetTurnState: ConversationTransitionWritebackPort['resetTurnState'];
  endConversationHydration: ConversationTransitionWritebackPort['endConversationHydration'];
}

export function createConversationHydrationRuntimeViewHostFactoryHost(
  host: ConversationHydrationRuntimeHostProviderHost,
): ConversationHydrationRuntimeViewHostFactoryHost {
  return {
    getHydrationRenderRuntime: () => ({
      getMessagesContainer: () => host.getMessagesContainer(),
      getActiveTabId: () => host.getActiveTabId(),
      getScrollRuntimeForTab: (tabId) => host.getScrollRuntimeForTab(tabId),
      scrollToBottom: (options) => {
        host.scrollToBottom(options);
      },
      syncPaneScrollMetrics: (tabId, messagesEl) => {
        host.syncPaneScrollMetrics(tabId, messagesEl);
      },
      requestAnimationFrame: (callback) => host.requestAnimationFrame(callback),
    }),
    getHydrationOutcomeRuntime: () => ({
      syncBackgroundTaskStateFromConversation: (conversation) => {
        host.syncBackgroundTaskStateFromConversation(conversation);
      },
      renderMessages: (messages) => host.renderMessages(messages),
    }),
    getConversationTransitionState: () => ({
      getCurrentConversation: () => host.getCurrentConversation(),
      cancelTitleGeneration: (conversationId) => {
        host.cancelTitleGeneration(conversationId);
      },
      clearPendingTitleGenerationStatus: (conversationId) =>
        host.clearPendingTitleGenerationStatus(conversationId),
    }),
    getConversationTransitionWriteback: () => ({
      resetBackgroundTaskIndicator: () => {
        host.resetBackgroundTaskIndicator();
      },
      clearScheduledScrollToBottom: () => {
        host.clearScheduledScrollToBottom();
      },
      beginConversationHydration: (tabId) => {
        host.beginConversationHydration(tabId);
      },
      clearMessagesContainer: () => {
        host.clearMessagesContainer();
      },
      resetTurnState: () => {
        host.resetTurnState();
      },
      endConversationHydration: (tabId) => {
        host.endConversationHydration(tabId);
      },
    }),
  };
}
