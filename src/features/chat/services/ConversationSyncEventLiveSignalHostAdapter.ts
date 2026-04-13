import type {
  ConversationSessionLiveSignalAdapterHost,
} from './ConversationSessionLiveSignalAdapter';
import type { ConversationSyncEventAdapterHost } from './ConversationSyncEventAdapter';

export interface ConversationSyncEventLiveSignalHostAdapterHost {
  subscribeToSessionSyncEvents: ConversationSyncEventAdapterHost['subscribeToSessionSyncEvents'];
  subscribeToSessionTodoUpdates: ConversationSessionLiveSignalAdapterHost['subscribeToSessionTodoUpdates'];
  subscribeToSessionStatusUpdates: ConversationSessionLiveSignalAdapterHost['subscribeToSessionStatusUpdates'];
  getAllTabs: ConversationSyncEventAdapterHost['getAllTabs'];
  getConversations: ConversationSyncEventAdapterHost['getConversations'];
  getCurrentConversation: ConversationSyncEventAdapterHost['getCurrentConversation'];
  getActiveTabId: ConversationSyncEventAdapterHost['getActiveTabId'];
  scheduleConversationSyncFromSignal: ConversationSyncEventAdapterHost['scheduleConversationSyncFromSignal'];
  applySessionTodoUpdate: ConversationSessionLiveSignalAdapterHost['applySessionTodoUpdate'];
  applySessionStatusUpdate: ConversationSessionLiveSignalAdapterHost['applySessionStatusUpdate'];
}

export interface ConversationSyncEventLiveSignalHosts {
  conversationSyncEventAdapterHost: ConversationSyncEventAdapterHost;
  conversationSessionLiveSignalAdapterHost: ConversationSessionLiveSignalAdapterHost;
}

export function createConversationSyncEventLiveSignalHosts(
  host: ConversationSyncEventLiveSignalHostAdapterHost,
): ConversationSyncEventLiveSignalHosts {
  const sharedSignalLookupHost = {
    getAllTabs: () => host.getAllTabs(),
    getConversations: () => host.getConversations(),
    getCurrentConversation: () => host.getCurrentConversation(),
    getActiveTabId: () => host.getActiveTabId(),
  };

  return {
    conversationSyncEventAdapterHost: {
      subscribeToSessionSyncEvents: (listener) => host.subscribeToSessionSyncEvents(listener),
      ...sharedSignalLookupHost,
      scheduleConversationSyncFromSignal: (tabId, reason) =>
        host.scheduleConversationSyncFromSignal(tabId, reason),
    },
    conversationSessionLiveSignalAdapterHost: {
      subscribeToSessionTodoUpdates: (listener) => host.subscribeToSessionTodoUpdates(listener),
      subscribeToSessionStatusUpdates: (listener) => host.subscribeToSessionStatusUpdates(listener),
      ...sharedSignalLookupHost,
      applySessionTodoUpdate: (tabId, sessionId, todos) =>
        host.applySessionTodoUpdate(tabId, sessionId, todos),
      applySessionStatusUpdate: (tabId, sessionId, status) =>
        host.applySessionStatusUpdate(tabId, sessionId, status),
    },
  };
}
