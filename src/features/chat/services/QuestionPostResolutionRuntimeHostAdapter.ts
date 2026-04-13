import type { TabId } from '../tabs';
import type {
  QuestionPostResolutionRuntimeFacadeHost,
  QuestionPostResolutionRuntimeState,
} from './QuestionPostResolutionRuntimeFacade';
import type {
  QuestionRuntimeConversationSyncPort,
  QuestionRuntimeStatusRefreshPort,
} from './QuestionRuntimeViewHostAdapter';

export interface QuestionPostResolutionRuntimeViewHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionPostResolutionRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
}

export interface QuestionPostResolutionRuntimeHostAdapterDependencies {
  viewHost: QuestionPostResolutionRuntimeViewHost;
  conversationSync: QuestionRuntimeConversationSyncPort;
  statusRefresh: QuestionRuntimeStatusRefreshPort;
}

export function createQuestionPostResolutionRuntimeHostAdapter(
  dependencies: QuestionPostResolutionRuntimeHostAdapterDependencies,
): QuestionPostResolutionRuntimeFacadeHost {
  return {
    getActiveTabId: () => dependencies.viewHost.getActiveTabId(),
    getTabRuntimeState: (tabId) => dependencies.viewHost.getTabRuntimeState(tabId),
    getSessionIdForTab: (tabId) => dependencies.viewHost.getSessionIdForTab(tabId),
    refreshTabSessionStatus: (tabId, sessionId, options) =>
      dependencies.statusRefresh.refreshTabSessionStatus(tabId, sessionId, options),
    startConversationSyncLoop: () => {
      dependencies.conversationSync.startConversationSyncLoop();
    },
    syncVisibleConversationInBackground: () =>
      dependencies.conversationSync.syncVisibleConversationInBackground(),
  };
}
