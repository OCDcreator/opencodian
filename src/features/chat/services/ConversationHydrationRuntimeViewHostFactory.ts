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
  'syncBackgroundTaskStateFromConversation' | 'reapplyConversationSessionVisualState' | 'renderMessages'
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

export interface ConversationHydrationRuntimeViewHost extends
  ConversationHydrationRenderRuntimePort,
  ConversationHydrationOutcomeRuntimePort,
  ConversationTransitionStatePort,
  ConversationTransitionWritebackPort {}

export function createConversationHydrationRuntimeViewHosts(
  host: ConversationHydrationRuntimeViewHost,
): ConversationHydrationRuntimeViewHosts {
  return {
    conversationHydrationRenderBridgeHost: {
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
    },
    conversationHydrationOutcomeBridgeHost: {
      syncBackgroundTaskStateFromConversation: (conversation) => {
        host.syncBackgroundTaskStateFromConversation(conversation);
      },
      reapplyConversationSessionVisualState: (conversation) => {
        host.reapplyConversationSessionVisualState(conversation);
      },
      renderMessages: (messages) => host.renderMessages(messages),
    },
    conversationTransitionBridgeHost: {
      getCurrentConversation: () => host.getCurrentConversation(),
      cancelTitleGeneration: (conversationId) => {
        host.cancelTitleGeneration(conversationId);
      },
      resetBackgroundTaskIndicator: () => {
        host.resetBackgroundTaskIndicator();
      },
      clearPendingTitleGenerationStatus: (conversationId) =>
        host.clearPendingTitleGenerationStatus(conversationId),
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
    },
  };
}
