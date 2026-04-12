import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  QuestionRuntimeState,
  QuestionRuntimeViewHost,
} from './QuestionRuntimeHostAdapter';
import type { QuestionDockSlotCoordinator } from './QuestionDockSlotCoordinator';

type QuestionDockSlotCoordinatorPort = Pick<
  QuestionDockSlotCoordinator,
  'getQuestionDock' | 'shouldUseAboveInputQuestionDock'
>;

export interface QuestionRuntimeSettingsPort {
  questionDisplayMode: QuestionDisplayMode;
  showAnsweredQuestionCards: boolean;
}

export interface QuestionRuntimeQuestionApiPort {
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export interface QuestionRuntimeTabAttentionPort {
  setNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export interface QuestionRuntimeConversationSyncPort {
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export interface QuestionRuntimeStatusRefreshPort {
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<unknown>;
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
  conversationSync: QuestionRuntimeConversationSyncPort;
  statusRefresh: QuestionRuntimeStatusRefreshPort;
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
    getPendingQuestions: () => dependencies.questionApi.getPendingQuestions(),
    replyToQuestion: (requestId, answers) =>
      dependencies.questionApi.replyToQuestion(requestId, answers),
    rejectQuestion: (requestId) => dependencies.questionApi.rejectQuestion(requestId),
    refreshTabSessionStatus: (tabId, sessionId, options) =>
      dependencies.statusRefresh.refreshTabSessionStatus(tabId, sessionId, options),
    startConversationSyncLoop: () => {
      dependencies.conversationSync.startConversationSyncLoop();
    },
    syncVisibleConversationInBackground: () =>
      dependencies.conversationSync.syncVisibleConversationInBackground(),
  };
}
