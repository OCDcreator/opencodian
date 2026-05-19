import type { ConversationSyncViewHost } from '../services/ConversationSyncHostAdapter';
import type { ConversationLoadRuntimeBridgeHost } from './ConversationLoadRuntimeBridge';

export interface ConversationSyncLoadRuntimeHostAdapterHost {
  getCurrentConversation: ConversationSyncViewHost['getCurrentConversation'];
  getActiveTabId: ConversationSyncViewHost['getActiveTabId'];
  getAllTabs: ConversationSyncViewHost['getAllTabs'];
  getTab: ConversationSyncViewHost['getTab'];
  getTabRuntimeState: ConversationSyncViewHost['getTabRuntimeState'];
  loadConversations: ConversationLoadRuntimeBridgeHost['loadConversations'];
  getConversationById: ConversationSyncViewHost['getConversationById'];
  shouldSyncConversationFromServer: ConversationLoadRuntimeBridgeHost['shouldSyncConversationFromServer'];
  getConversationSyncFingerprint: ConversationSyncViewHost['getConversationSyncFingerprint'];
  canSyncConversationWithServer: ConversationSyncViewHost['canSyncConversationWithServer'];
  syncConversationMessagesFromServer: ConversationSyncViewHost['syncConversationMessagesFromServer'];
  syncConversationMessagesFromCanonicalState:
    ConversationSyncViewHost['syncConversationMessagesFromCanonicalState'];
  setCurrentConversationRevertState: ConversationLoadRuntimeBridgeHost['setCurrentConversationRevertState'];
  applySyncedConversationUpdate: ConversationSyncViewHost['applySyncedConversationUpdate'];
  renderBackgroundTaskIndicatorIfNeeded: ConversationSyncViewHost['renderBackgroundTaskIndicatorIfNeeded'];
}

export interface ConversationSyncLoadRuntimeHosts {
  conversationSyncViewHost: ConversationSyncViewHost;
  conversationLoadRuntimeBridgeHost: ConversationLoadRuntimeBridgeHost;
}

export function createConversationSyncLoadRuntimeHosts(
  host: ConversationSyncLoadRuntimeHostAdapterHost,
): ConversationSyncLoadRuntimeHosts {
  return {
    conversationSyncViewHost: {
      getCurrentConversation: () => host.getCurrentConversation(),
      getActiveTabId: () => host.getActiveTabId(),
      getAllTabs: () => host.getAllTabs(),
      getTab: (tabId) => host.getTab(tabId),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getConversationById: (id) => host.getConversationById(id),
      getConversationSyncFingerprint: (messages) =>
        host.getConversationSyncFingerprint(messages),
      canSyncConversationWithServer: () => host.canSyncConversationWithServer(),
      syncConversationMessagesFromServer: (
        conversation,
        tabId,
        reason,
        options,
      ) => host.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      syncConversationMessagesFromCanonicalState: (
        conversation,
        tabId,
        reason,
        options,
      ) => host.syncConversationMessagesFromCanonicalState(conversation, tabId, reason, options),
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        host.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        host.renderBackgroundTaskIndicatorIfNeeded(tabId),
    },
    conversationLoadRuntimeBridgeHost: {
      loadConversations: () => host.loadConversations(),
      getConversationById: (id) => host.getConversationById(id),
      shouldSyncConversationFromServer: (conversation, options) =>
        host.shouldSyncConversationFromServer(conversation, options),
      syncConversationMessagesFromServer: async (conversation, tabId, reason) => {
        const {
          messages,
          revertState,
        } = await host.syncConversationMessagesFromServer(conversation, tabId, reason);
        return {
          messages,
          revertState,
        };
      },
      setCurrentConversationRevertState: (revertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
    },
  };
}
