import type { ChatMessage } from '../../../core/types';
import {
  type Conversation,
  getConversationBackendSessionId,
} from '../../../core/types';
import {
  type ConversationSyncLoadRuntimeHostAdapterHost,
  type ConversationSyncLoadRuntimeHosts,
  createConversationSyncLoadRuntimeHosts,
} from '../runtime/ConversationSyncLoadRuntimeHostAdapter';

type ConversationSyncLoadConversationStorePort = Pick<
  ConversationSyncLoadRuntimeHostAdapterHost,
  'loadConversations' | 'getConversationById'
>;

type ConversationSyncLoadTabRuntimePort = Pick<
  ConversationSyncLoadRuntimeHostAdapterHost,
  'getCurrentConversation' | 'getActiveTabId' | 'getAllTabs' | 'getTab' | 'getTabRuntimeState'
>;

type ConversationSyncLoadBridgePort = Pick<
  ConversationSyncLoadRuntimeHostAdapterHost,
  | 'getConversationSyncFingerprint'
  | 'canSyncConversationWithServer'
  | 'syncConversationMessagesFromServer'
  | 'syncConversationMessagesFromCanonicalState'
  | 'setCurrentConversationRevertState'
  | 'applySyncedConversationUpdate'
  | 'renderBackgroundTaskIndicatorIfNeeded'
>;

export interface ConversationSyncLoadRuntimeViewHost extends
  ConversationSyncLoadConversationStorePort,
  ConversationSyncLoadTabRuntimePort,
  ConversationSyncLoadBridgePort {
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
}

function shouldUseOpenCodeServerSync(conversation: Conversation): boolean {
  return (conversation.backend ?? 'opencode') === 'opencode'
    && Boolean(getConversationBackendSessionId(conversation));
}

export function createConversationSyncLoadRuntimeViewHosts(
  host: ConversationSyncLoadRuntimeViewHost,
): ConversationSyncLoadRuntimeHosts {
  return createConversationSyncLoadRuntimeHosts({
    getCurrentConversation: () => host.getCurrentConversation(),
    getActiveTabId: () => host.getActiveTabId(),
    getAllTabs: () => host.getAllTabs(),
    getTab: (tabId) => host.getTab(tabId),
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    loadConversations: () => host.loadConversations(),
    getConversationById: (id) => host.getConversationById(id),
    shouldSyncConversationFromServer: (conversation, options) => {
      if (!shouldUseOpenCodeServerSync(conversation)) {
        return false;
      }
      const shouldSyncInterrupted = !host.hasInterruptedLocalAssistantTail(conversation.messages)
        && conversation.messages.some((message) =>
          message.displayStyle !== 'notice'
          && !message.sourceMessageId
        );
      return Boolean(
        options.forceServerSync
        || !conversation.messages
        || conversation.messages.length === 0
        || shouldSyncInterrupted,
      );
    },
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncFingerprint(messages),
    canSyncConversationWithServer: () => host.canSyncConversationWithServer(),
    syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
      host.syncConversationMessagesFromServer(conversation, tabId, reason, options),
    syncConversationMessagesFromCanonicalState: (conversation, tabId, reason, options) =>
      host.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
    setCurrentConversationRevertState: (revertState) => {
      host.setCurrentConversationRevertState(revertState);
    },
    applySyncedConversationUpdate: (previousMessages, nextMessages) =>
      host.applySyncedConversationUpdate(previousMessages, nextMessages),
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      host.renderBackgroundTaskIndicatorIfNeeded(tabId),
  });
}
