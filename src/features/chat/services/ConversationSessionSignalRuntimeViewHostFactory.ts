import type {
  ConversationSyncEventLiveSignalHostAdapterHost,
} from './ConversationSyncEventLiveSignalHostAdapter';

type ConversationSessionSignalSubscriptionPort = Pick<
  ConversationSyncEventLiveSignalHostAdapterHost,
  | 'subscribeToSessionSyncEvents'
  | 'subscribeToSessionTodoUpdates'
  | 'subscribeToSessionStatusUpdates'
>;

type ConversationSessionSignalWritebackPort = Pick<
  ConversationSyncEventLiveSignalHostAdapterHost,
  | 'applySessionTodoUpdate'
  | 'applySessionStatusUpdate'
>;

export interface ConversationSessionSignalRuntimeViewHostFactoryHost extends Pick<
  ConversationSyncEventLiveSignalHostAdapterHost,
  | 'getAllTabs'
  | 'getConversations'
  | 'getCurrentConversation'
  | 'getActiveTabId'
  | 'scheduleConversationSyncFromSignal'
> {
  getSessionSignalSubscriptions(): ConversationSessionSignalSubscriptionPort;
  getSessionSignalWriteback(): ConversationSessionSignalWritebackPort;
}

export function createConversationSessionSignalRuntimeViewHost(
  host: ConversationSessionSignalRuntimeViewHostFactoryHost,
): ConversationSyncEventLiveSignalHostAdapterHost {
  return {
    subscribeToSessionSyncEvents: (listener) =>
      host.getSessionSignalSubscriptions().subscribeToSessionSyncEvents(listener),
    subscribeToSessionTodoUpdates: (listener) =>
      host.getSessionSignalSubscriptions().subscribeToSessionTodoUpdates(listener),
    subscribeToSessionStatusUpdates: (listener) =>
      host.getSessionSignalSubscriptions().subscribeToSessionStatusUpdates(listener),
    getAllTabs: () => host.getAllTabs(),
    getConversations: () => host.getConversations(),
    getCurrentConversation: () => host.getCurrentConversation(),
    getActiveTabId: () => host.getActiveTabId(),
    scheduleConversationSyncFromSignal: (tabId, reason) =>
      host.scheduleConversationSyncFromSignal(tabId, reason),
    applySessionTodoUpdate: (tabId, sessionId, todos) =>
      host.getSessionSignalWriteback().applySessionTodoUpdate(tabId, sessionId, todos),
    applySessionStatusUpdate: (tabId, sessionId, status) =>
      host.getSessionSignalWriteback().applySessionStatusUpdate(tabId, sessionId, status),
  };
}
