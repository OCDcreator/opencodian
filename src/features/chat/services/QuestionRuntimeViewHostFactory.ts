import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';
import type { QuestionRuntimeViewHost } from './QuestionRuntimeHostAdapter';
import {
  createQuestionRuntimeViewHostAdapter,
  type QuestionRuntimeQuestionApiPort,
  type QuestionRuntimeSettingsPort,
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
  });
}
