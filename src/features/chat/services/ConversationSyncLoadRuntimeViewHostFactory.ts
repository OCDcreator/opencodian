import type { ChatMessage } from '../../../core/types';
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
  | 'syncConversationMessagesFromServer'
  | 'setCurrentConversationRevertState'
  | 'applySyncedConversationUpdate'
  | 'renderBackgroundTaskIndicatorIfNeeded'
>;

export interface ConversationSyncLoadRuntimeViewHostFactoryHost {
  getConversationStore(): ConversationSyncLoadConversationStorePort;
  getTabRuntime(): ConversationSyncLoadTabRuntimePort;
  getConversationSyncBridge(): ConversationSyncLoadBridgePort;
  hasInterruptedLocalAssistantTail(messages: ChatMessage[]): boolean;
}

export function createConversationSyncLoadRuntimeViewHosts(
  host: ConversationSyncLoadRuntimeViewHostFactoryHost,
): ConversationSyncLoadRuntimeHosts {
  return createConversationSyncLoadRuntimeHosts({
    getCurrentConversation: () => host.getTabRuntime().getCurrentConversation(),
    getActiveTabId: () => host.getTabRuntime().getActiveTabId(),
    getAllTabs: () => host.getTabRuntime().getAllTabs(),
    getTab: (tabId) => host.getTabRuntime().getTab(tabId),
    getTabRuntimeState: (tabId) => host.getTabRuntime().getTabRuntimeState(tabId),
    loadConversations: () => host.getConversationStore().loadConversations(),
    getConversationById: (id) => host.getConversationStore().getConversationById(id),
    shouldSyncConversationFromServer: (conversation, options) => {
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
      host.getConversationSyncBridge().getConversationSyncFingerprint(messages),
    syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
      host.getConversationSyncBridge().syncConversationMessagesFromServer(
        conversation,
        tabId,
        reason,
        options,
      ),
    setCurrentConversationRevertState: (revertState) => {
      host.getConversationSyncBridge().setCurrentConversationRevertState(revertState);
    },
    applySyncedConversationUpdate: (previousMessages, nextMessages) =>
      host.getConversationSyncBridge().applySyncedConversationUpdate(
        previousMessages,
        nextMessages,
      ),
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      host.getConversationSyncBridge().renderBackgroundTaskIndicatorIfNeeded(tabId),
  });
}
