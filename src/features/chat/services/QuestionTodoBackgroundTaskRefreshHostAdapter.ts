import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  BackgroundTaskPostSyncCoordinator,
  type BackgroundTaskPostSyncCoordinatorHost,
  type ConversationRevertStateSnapshot,
} from './BackgroundTaskPostSyncCoordinator';
import {
  PostSyncQuestionTodoRefreshFacade,
  type PostSyncQuestionTodoRefreshFacadeHost,
} from './PostSyncQuestionTodoRefreshFacade';
import {
  QuestionTodoStatusRefreshCoordinator,
  type QuestionTodoStatusRefreshCoordinatorHost,
  type QuestionTodoStatusRefreshRuntime,
} from './QuestionTodoStatusRefreshCoordinator';

export interface QuestionTodoBackgroundTaskRefreshViewHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined,
  ): Promise<QuestionRequest[]>;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  refreshBackgroundTaskCompletionNotices(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void>;
  syncTabStreamLikeState(tabId: TabId | null): void;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export interface QuestionTodoBackgroundTaskRefreshHosts {
  questionTodoStatusRefreshHost: QuestionTodoStatusRefreshCoordinatorHost;
  postSyncQuestionTodoRefreshFacadeHost: PostSyncQuestionTodoRefreshFacadeHost;
  backgroundTaskPostSyncCoordinatorHost: BackgroundTaskPostSyncCoordinatorHost;
}

export interface QuestionTodoBackgroundTaskRefreshServices {
  questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshCoordinator;
  postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshFacade;
  backgroundTaskPostSyncCoordinator: BackgroundTaskPostSyncCoordinator;
}

export function createQuestionTodoBackgroundTaskRefreshHosts(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
): QuestionTodoBackgroundTaskRefreshHosts {
  return {
    questionTodoStatusRefreshHost: {
      getTabRuntimeState: (tabId: TabId | null) => viewHost.getTabRuntimeState(tabId),
      hasIncompleteTodos: (todos: readonly SessionTodo[]) => viewHost.hasIncompleteTodos(todos),
      refreshPendingQuestionsForTab: (
        tabId: TabId | null,
        sessionId: string | null | undefined,
      ) => viewHost.refreshPendingQuestionsForTab(tabId, sessionId),
      refreshTabSessionStatus: (
        tabId: TabId | null,
        sessionId: string | null | undefined,
        options: { suppressErrors?: boolean },
      ) => viewHost.refreshTabSessionStatus(tabId, sessionId, options),
      refreshTabSessionTodos: (
        tabId: TabId | null,
        sessionId: string | null | undefined,
        options: { suppressErrors?: boolean },
      ) => viewHost.refreshTabSessionTodos(tabId, sessionId, options),
    },
    postSyncQuestionTodoRefreshFacadeHost: {
      getCurrentConversationSessionId: () =>
        viewHost.getCurrentConversation()?.openCodeSessionId,
      syncBackgroundTaskStateFromConversation: (
        conversation: Conversation,
        tabId?: TabId | null,
      ) => viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId),
      refreshBackgroundTaskCompletionNotices: (
        tabId: TabId | null,
        conversation: Conversation | null,
      ) => viewHost.refreshBackgroundTaskCompletionNotices(tabId, conversation),
      syncTabStreamLikeState: (tabId: TabId | null) => {
        viewHost.syncTabStreamLikeState(tabId);
      },
    },
    backgroundTaskPostSyncCoordinatorHost: {
      getCurrentConversationId: () => viewHost.getCurrentConversation()?.id ?? null,
      setCurrentConversationRevertState: (
        revertState: ConversationRevertStateSnapshot | null,
      ) => {
        viewHost.setCurrentConversationRevertState(revertState);
      },
      setTabConversationSyncFingerprint: (tabId: TabId, fingerprint: string) => {
        viewHost.setTabConversationSyncFingerprint(tabId, fingerprint);
      },
      markBackgroundTaskAuthoritativeSync: (tabId: TabId | null, reason: string) => {
        viewHost.markBackgroundTaskAuthoritativeSync(tabId, reason);
      },
      setTabNeedsAttention: (tabId: TabId | null, needsAttention: boolean) =>
        viewHost.setTabNeedsAttention(tabId, needsAttention),
    },
  };
}

export function createQuestionTodoBackgroundTaskRefreshServices(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
): QuestionTodoBackgroundTaskRefreshServices {
  const hosts = createQuestionTodoBackgroundTaskRefreshHosts(viewHost);
  const questionTodoStatusRefreshCoordinator = new QuestionTodoStatusRefreshCoordinator(
    hosts.questionTodoStatusRefreshHost,
  );
  const postSyncQuestionTodoRefreshFacade = new PostSyncQuestionTodoRefreshFacade(
    hosts.postSyncQuestionTodoRefreshFacadeHost,
    questionTodoStatusRefreshCoordinator,
  );
  const backgroundTaskPostSyncCoordinator = new BackgroundTaskPostSyncCoordinator(
    hosts.backgroundTaskPostSyncCoordinatorHost,
    postSyncQuestionTodoRefreshFacade,
  );

  return {
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshFacade,
    backgroundTaskPostSyncCoordinator,
  };
}
