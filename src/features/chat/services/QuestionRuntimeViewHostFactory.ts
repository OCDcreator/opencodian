import type { QuestionRuntimeViewHost } from './QuestionRuntimeHostAdapter';
import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';
import {
  createQuestionRuntimeViewHostAdapter,
  type QuestionRuntimeConversationSyncPort,
  type QuestionRuntimeQuestionApiPort,
  type QuestionRuntimeSettingsPort,
  type QuestionRuntimeStatusRefreshPort,
  type QuestionRuntimeTabAttentionPort,
  type QuestionRuntimeViewHostAdapterHost,
} from './QuestionRuntimeViewHostAdapter';

type QuestionDockSlotCoordinatorPort = Pick<
  QuestionDockSlotCoordinator,
  'getQuestionDock' | 'shouldUseAboveInputQuestionDock'
>;

export interface QuestionRuntimeViewHostFactoryHost extends QuestionRuntimeViewHostAdapterHost {
  settings: QuestionRuntimeSettingsPort;
  getQuestionDockSlotCoordinator(): QuestionDockSlotCoordinatorPort;
  getQuestionApi(): QuestionRuntimeQuestionApiPort;
  getTabAttention(): QuestionRuntimeTabAttentionPort;
  getConversationSync(): QuestionRuntimeConversationSyncPort;
  getStatusRefresh(): QuestionRuntimeStatusRefreshPort;
}

export function createQuestionRuntimeViewHost(
  host: QuestionRuntimeViewHostFactoryHost,
): QuestionRuntimeViewHost {
  return createQuestionRuntimeViewHostAdapter({
    viewHost: {
      getActiveTabId: () => host.getActiveTabId(),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      ensureTabRuntimeState: (tabId) => host.ensureTabRuntimeState(tabId),
      getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      keepQuestionCardPinnedToBottom: (tabId) => {
        host.keepQuestionCardPinnedToBottom(tabId);
      },
    },
    settings: host.settings,
    questionDockSlotCoordinator: {
      getQuestionDock: () => host.getQuestionDockSlotCoordinator().getQuestionDock(),
      shouldUseAboveInputQuestionDock: () =>
        host.getQuestionDockSlotCoordinator().shouldUseAboveInputQuestionDock(),
    },
    questionApi: {
      getPendingQuestions: () => host.getQuestionApi().getPendingQuestions(),
      replyToQuestion: (requestId, answers) =>
        host.getQuestionApi().replyToQuestion(requestId, answers),
      rejectQuestion: (requestId) => host.getQuestionApi().rejectQuestion(requestId),
    },
    tabAttention: {
      setNeedsAttention: (tabId, needsAttention) => {
        host.getTabAttention().setNeedsAttention(tabId, needsAttention);
      },
    },
    conversationSync: {
      startConversationSyncLoop: () => {
        host.getConversationSync().startConversationSyncLoop();
      },
      syncVisibleConversationInBackground: () =>
        host.getConversationSync().syncVisibleConversationInBackground(),
    },
    statusRefresh: {
      refreshTabSessionStatus: (tabId, sessionId, options) =>
        host.getStatusRefresh().refreshTabSessionStatus(tabId, sessionId, options),
    },
  });
}
