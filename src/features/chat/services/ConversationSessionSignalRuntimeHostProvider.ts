import type {
  ConversationSessionSignalRuntimeViewHostFactoryHost,
} from './ConversationSessionSignalRuntimeViewHostFactory';

type ConversationSessionSignalSubscriptionPort = ReturnType<
  ConversationSessionSignalRuntimeViewHostFactoryHost['getSessionSignalSubscriptions']
>;
type ConversationSessionSignalWritebackPort = ReturnType<
  ConversationSessionSignalRuntimeViewHostFactoryHost['getSessionSignalWriteback']
>;

export interface ConversationSessionSignalRuntimeHostProviderHost extends Pick<
  ConversationSessionSignalRuntimeViewHostFactoryHost,
  | 'getAllTabs'
  | 'getConversations'
  | 'getCurrentConversation'
  | 'getActiveTabId'
  | 'scheduleConversationSyncFromSignal'
> {
  subscribeToSessionSyncEvents:
    ConversationSessionSignalSubscriptionPort['subscribeToSessionSyncEvents'];
  subscribeToSessionTodoUpdates:
    ConversationSessionSignalSubscriptionPort['subscribeToSessionTodoUpdates'];
  subscribeToSessionStatusUpdates:
    ConversationSessionSignalSubscriptionPort['subscribeToSessionStatusUpdates'];
  applySessionTodoUpdate: ConversationSessionSignalWritebackPort['applySessionTodoUpdate'];
  applySessionStatusUpdate: ConversationSessionSignalWritebackPort['applySessionStatusUpdate'];
}

export function createConversationSessionSignalRuntimeViewHostFactoryHost(
  host: ConversationSessionSignalRuntimeHostProviderHost,
): ConversationSessionSignalRuntimeViewHostFactoryHost {
  return {
    getSessionSignalSubscriptions: () => ({
      subscribeToSessionSyncEvents: (listener) => host.subscribeToSessionSyncEvents(listener),
      subscribeToSessionTodoUpdates: (listener) => host.subscribeToSessionTodoUpdates(listener),
      subscribeToSessionStatusUpdates: (listener) => host.subscribeToSessionStatusUpdates(listener),
    }),
    getSessionSignalWriteback: () => ({
      applySessionTodoUpdate: (tabId, sessionId, todos) => {
        host.applySessionTodoUpdate(tabId, sessionId, todos);
      },
      applySessionStatusUpdate: (tabId, sessionId, status) => {
        host.applySessionStatusUpdate(tabId, sessionId, status);
      },
    }),
    getAllTabs: () => host.getAllTabs(),
    getConversations: () => host.getConversations(),
    getCurrentConversation: () => host.getCurrentConversation(),
    getActiveTabId: () => host.getActiveTabId(),
    scheduleConversationSyncFromSignal: (tabId, reason) => {
      host.scheduleConversationSyncFromSignal(tabId, reason);
    },
  };
}
