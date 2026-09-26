import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';
import type { QuestionResolutionRequestRoute } from './QuestionResolutionExecutionFacade';
import type {
  QuestionRuntimeState,
  QuestionRuntimeViewHost,
} from './QuestionRuntimeHostAdapter';

type QuestionDockSlotCoordinatorPort = Pick<
  QuestionDockSlotCoordinator,
  'getQuestionDock' | 'shouldUseAboveInputQuestionDock'
>;

export interface QuestionRuntimeSettingsPort {
  questionDisplayMode: QuestionDisplayMode;
  showAnsweredQuestionCards: boolean;
}

export interface QuestionRuntimeQuestionApiPort {
  /** True only when an empty pending read is a native authoritative readback. */
  isPendingQuestionReadAuthoritative?(tabId?: TabId | null): boolean;
  getPendingQuestions(tabId?: TabId | null): Promise<QuestionRequest[]>;
  replyToQuestion(
    requestId: string,
    answers: string[][],
    context?: QuestionResolutionRequestRoute,
  ): Promise<void>;
  rejectQuestion(requestId: string, context?: QuestionResolutionRequestRoute): Promise<void>;
}

export interface QuestionRuntimeTabAttentionPort {
  setNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export interface QuestionRuntimeViewHostAdapterHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionRuntimeState | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
}

export interface QuestionRuntimeViewHostAdapterDependencies {
  viewHost: QuestionRuntimeViewHostAdapterHost;
  settings: QuestionRuntimeSettingsPort;
  questionDockSlotCoordinator: QuestionDockSlotCoordinatorPort;
  questionApi: QuestionRuntimeQuestionApiPort;
  tabAttention: QuestionRuntimeTabAttentionPort;
}

export function createQuestionRuntimeViewHostAdapter(
  dependencies: QuestionRuntimeViewHostAdapterDependencies,
): QuestionRuntimeViewHost {
  return {
    getActiveTabId: () => dependencies.viewHost.getActiveTabId(),
    getTabRuntimeState: (tabId) => dependencies.viewHost.getTabRuntimeState(tabId),
    ensureTabRuntimeState: (tabId) => dependencies.viewHost.ensureTabRuntimeState(tabId),
    getCurrentConversationSessionId: () =>
      dependencies.viewHost.getCurrentConversationSessionId(),
    getSessionIdForTab: (tabId) => dependencies.viewHost.getSessionIdForTab(tabId),
    getQuestionDock: () => dependencies.questionDockSlotCoordinator.getQuestionDock(),
    getQuestionDisplayMode: () => dependencies.settings.questionDisplayMode,
    shouldUseAboveInputQuestionDock: () =>
      dependencies.questionDockSlotCoordinator.shouldUseAboveInputQuestionDock(),
    shouldRenderQuestionResolutionCards: () =>
      dependencies.settings.showAnsweredQuestionCards,
    keepQuestionCardPinnedToBottom: (tabId) => {
      dependencies.viewHost.keepQuestionCardPinnedToBottom(tabId);
    },
    setTabNeedsAttention: (tabId, needsAttention) => {
      dependencies.tabAttention.setNeedsAttention(tabId, needsAttention);
    },
    isPendingQuestionReadAuthoritative: (tabId) =>
      dependencies.questionApi.isPendingQuestionReadAuthoritative?.(tabId) ?? false,
    getPendingQuestions: (tabId) => tabId === undefined
      ? dependencies.questionApi.getPendingQuestions()
      : dependencies.questionApi.getPendingQuestions(tabId),
    replyToQuestion: (requestId, answers, context) => context
      ? dependencies.questionApi.replyToQuestion(requestId, answers, context)
      : dependencies.questionApi.replyToQuestion(requestId, answers),
    rejectQuestion: (requestId, context) => context
      ? dependencies.questionApi.rejectQuestion(requestId, context)
      : dependencies.questionApi.rejectQuestion(requestId),
  };
}
