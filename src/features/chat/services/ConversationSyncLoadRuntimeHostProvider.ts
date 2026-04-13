import type {
  ConversationSyncLoadRuntimeViewHostFactoryHost,
} from './ConversationSyncLoadRuntimeViewHostFactory';

type ConversationSyncLoadConversationStorePort = ReturnType<
  ConversationSyncLoadRuntimeViewHostFactoryHost['getConversationStore']
>;
type ConversationSyncLoadTabRuntimePort = ReturnType<
  ConversationSyncLoadRuntimeViewHostFactoryHost['getTabRuntime']
>;
type ConversationSyncLoadBridgePort = ReturnType<
  ConversationSyncLoadRuntimeViewHostFactoryHost['getConversationSyncBridge']
>;

export interface ConversationSyncLoadRuntimeHostProviderHost {
  loadConversations: ConversationSyncLoadConversationStorePort['loadConversations'];
  getConversationById: ConversationSyncLoadConversationStorePort['getConversationById'];
  getCurrentConversation: ConversationSyncLoadTabRuntimePort['getCurrentConversation'];
  getActiveTabId: ConversationSyncLoadTabRuntimePort['getActiveTabId'];
  getAllTabs: ConversationSyncLoadTabRuntimePort['getAllTabs'];
  getTab: ConversationSyncLoadTabRuntimePort['getTab'];
  getTabRuntimeState: ConversationSyncLoadTabRuntimePort['getTabRuntimeState'];
  getConversationSyncFingerprint:
    ConversationSyncLoadBridgePort['getConversationSyncFingerprint'];
  syncConversationMessagesFromServer:
    ConversationSyncLoadBridgePort['syncConversationMessagesFromServer'];
  setCurrentConversationRevertState:
    ConversationSyncLoadBridgePort['setCurrentConversationRevertState'];
  applySyncedConversationUpdate:
    ConversationSyncLoadBridgePort['applySyncedConversationUpdate'];
  renderBackgroundTaskIndicatorIfNeeded:
    ConversationSyncLoadBridgePort['renderBackgroundTaskIndicatorIfNeeded'];
  hasInterruptedLocalAssistantTail:
    ConversationSyncLoadRuntimeViewHostFactoryHost['hasInterruptedLocalAssistantTail'];
}

export function createConversationSyncLoadRuntimeViewHostFactoryHost(
  host: ConversationSyncLoadRuntimeHostProviderHost,
): ConversationSyncLoadRuntimeViewHostFactoryHost {
  return {
    getConversationStore: () => ({
      loadConversations: () => host.loadConversations(),
      getConversationById: (id) => host.getConversationById(id),
    }),
    getTabRuntime: () => ({
      getCurrentConversation: () => host.getCurrentConversation(),
      getActiveTabId: () => host.getActiveTabId(),
      getAllTabs: () => host.getAllTabs(),
      getTab: (tabId) => host.getTab(tabId),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    }),
    getConversationSyncBridge: () => ({
      getConversationSyncFingerprint: (messages) =>
        host.getConversationSyncFingerprint(messages),
      syncConversationMessagesFromServer: (conversation, tabId, reason, options) =>
        host.syncConversationMessagesFromServer(conversation, tabId, reason, options),
      setCurrentConversationRevertState: (revertState) => {
        host.setCurrentConversationRevertState(revertState);
      },
      applySyncedConversationUpdate: (previousMessages, nextMessages) =>
        host.applySyncedConversationUpdate(previousMessages, nextMessages),
      renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
        host.renderBackgroundTaskIndicatorIfNeeded(tabId),
    }),
    hasInterruptedLocalAssistantTail: (messages) =>
      host.hasInterruptedLocalAssistantTail(messages),
  };
}
