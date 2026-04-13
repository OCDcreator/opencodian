import type {
  ConversationHydrationOutcomeBridgeHost,
} from '../runtime/ConversationHydrationOutcomeBridge';
import type {
  ConversationHydrationRenderBridgeHost,
} from '../runtime/ConversationHydrationRenderBridge';
import type {
  ConversationTransitionBridgeHost,
} from '../runtime/ConversationTransitionBridge';

type ConversationHydrationRenderRuntimePort = Pick<
  ConversationHydrationRenderBridgeHost,
  | 'getMessagesContainer'
  | 'getActiveTabId'
  | 'getScrollRuntimeForTab'
  | 'scrollToBottom'
  | 'syncPaneScrollMetrics'
  | 'requestAnimationFrame'
>;

type ConversationHydrationOutcomeRuntimePort = Pick<
  ConversationHydrationOutcomeBridgeHost,
  'syncBackgroundTaskStateFromConversation' | 'renderMessages'
>;

type ConversationTransitionStatePort = Pick<
  ConversationTransitionBridgeHost,
  'getCurrentConversation' | 'cancelTitleGeneration' | 'clearPendingTitleGenerationStatus'
>;

type ConversationTransitionWritebackPort = Pick<
  ConversationTransitionBridgeHost,
  | 'resetBackgroundTaskIndicator'
  | 'clearScheduledScrollToBottom'
  | 'beginConversationHydration'
  | 'clearMessagesContainer'
  | 'resetTurnState'
  | 'endConversationHydration'
>;

export interface ConversationHydrationRuntimeViewHosts {
  conversationHydrationRenderBridgeHost: ConversationHydrationRenderBridgeHost;
  conversationHydrationOutcomeBridgeHost: ConversationHydrationOutcomeBridgeHost;
  conversationTransitionBridgeHost: ConversationTransitionBridgeHost;
}

export interface ConversationHydrationRuntimeViewHostFactoryHost {
  getHydrationRenderRuntime(): ConversationHydrationRenderRuntimePort;
  getHydrationOutcomeRuntime(): ConversationHydrationOutcomeRuntimePort;
  getConversationTransitionState(): ConversationTransitionStatePort;
  getConversationTransitionWriteback(): ConversationTransitionWritebackPort;
}

export function createConversationHydrationRuntimeViewHosts(
  host: ConversationHydrationRuntimeViewHostFactoryHost,
): ConversationHydrationRuntimeViewHosts {
  return {
    conversationHydrationRenderBridgeHost: {
      getMessagesContainer: () => host.getHydrationRenderRuntime().getMessagesContainer(),
      getActiveTabId: () => host.getHydrationRenderRuntime().getActiveTabId(),
      getScrollRuntimeForTab: (tabId) => host.getHydrationRenderRuntime().getScrollRuntimeForTab(tabId),
      scrollToBottom: (options) => {
        host.getHydrationRenderRuntime().scrollToBottom(options);
      },
      syncPaneScrollMetrics: (tabId, messagesEl) => {
        host.getHydrationRenderRuntime().syncPaneScrollMetrics(tabId, messagesEl);
      },
      requestAnimationFrame: (callback) =>
        host.getHydrationRenderRuntime().requestAnimationFrame(callback),
    },
    conversationHydrationOutcomeBridgeHost: {
      syncBackgroundTaskStateFromConversation: (conversation) => {
        host.getHydrationOutcomeRuntime().syncBackgroundTaskStateFromConversation(conversation);
      },
      renderMessages: (messages) => host.getHydrationOutcomeRuntime().renderMessages(messages),
    },
    conversationTransitionBridgeHost: {
      getCurrentConversation: () => host.getConversationTransitionState().getCurrentConversation(),
      cancelTitleGeneration: (conversationId) => {
        host.getConversationTransitionState().cancelTitleGeneration(conversationId);
      },
      resetBackgroundTaskIndicator: () => {
        host.getConversationTransitionWriteback().resetBackgroundTaskIndicator();
      },
      clearPendingTitleGenerationStatus: (conversationId) =>
        host.getConversationTransitionState().clearPendingTitleGenerationStatus(conversationId),
      clearScheduledScrollToBottom: () => {
        host.getConversationTransitionWriteback().clearScheduledScrollToBottom();
      },
      beginConversationHydration: (tabId) => {
        host.getConversationTransitionWriteback().beginConversationHydration(tabId);
      },
      clearMessagesContainer: () => {
        host.getConversationTransitionWriteback().clearMessagesContainer();
      },
      resetTurnState: () => {
        host.getConversationTransitionWriteback().resetTurnState();
      },
      endConversationHydration: (tabId) => {
        host.getConversationTransitionWriteback().endConversationHydration(tabId);
      },
    },
  };
}
