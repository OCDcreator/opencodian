import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../core/types';
import type { BackgroundTaskIndicatorCoordinator } from '../runtime/BackgroundTaskIndicatorCoordinator';
import type { TabRuntimeStateBridge } from '../runtime/TabRuntimeStateBridge';
import type { TabId } from '../tabs';
import {
  BackgroundTaskPostSyncCoordinator,
  type BackgroundTaskPostSyncCoordinatorHost,
  type ConversationRevertStateSnapshot,
} from './BackgroundTaskPostSyncCoordinator';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import {
  PostSyncQuestionTodoRefreshFacade,
  type PostSyncQuestionTodoRefreshFacadeHost,
} from './PostSyncQuestionTodoRefreshFacade';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import {
  QuestionTodoStatusRefreshCoordinator,
  type QuestionTodoStatusRefreshCoordinatorHost,
  type QuestionTodoStatusRefreshRuntime,
} from './QuestionTodoStatusRefreshCoordinator';
import type { SessionTodoStateService } from './SessionTodoStateService';
import type { SessionTodoStatusRefreshService } from './SessionTodoStatusRefreshService';

type QuestionPendingRefreshPort = Pick<
  QuestionDockCoordinator,
  'refreshPendingQuestionsForTab'
>;
type SessionTodoStatePort = Pick<SessionTodoStateService, 'hasIncompleteTodos'>;
type SessionTodoStatusRefreshPort = Pick<
  SessionTodoStatusRefreshService,
  'refreshTabSessionStatus' | 'refreshTabSessionTodos'
>;
type BackgroundTaskIndicatorPort = Pick<
  BackgroundTaskIndicatorCoordinator,
  'queueAndFlushCompletionNotices'
>;
type BackgroundTaskLiveSignalPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'markAuthoritativeSync'
>;
type TabRuntimeStateBridgePort = Pick<
  TabRuntimeStateBridge,
  'setNeedsAttention' | 'syncStreamLikeState'
>;

export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
}

export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies {
  viewHost: QuestionTodoBackgroundTaskRefreshViewHostAdapterHost;
  getQuestionDockCoordinator(): QuestionPendingRefreshPort;
  getSessionTodoStateService(): SessionTodoStatePort;
  getSessionTodoStatusRefreshService(): SessionTodoStatusRefreshPort;
  getBackgroundTaskIndicatorCoordinator(): BackgroundTaskIndicatorPort;
  getBackgroundTaskLiveSignalCoordinator(): BackgroundTaskLiveSignalPort;
  getTabRuntimeStateBridge(): TabRuntimeStateBridgePort;
}

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

export function createQuestionTodoBackgroundTaskRefreshViewHostAdapter(
  dependencies: QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies,
): QuestionTodoBackgroundTaskRefreshViewHost {
  return {
    getCurrentConversation: () => dependencies.viewHost.getCurrentConversation(),
    getTabRuntimeState: (tabId: TabId | null) =>
      dependencies.viewHost.getTabRuntimeState(tabId),
    hasIncompleteTodos: (todos: readonly SessionTodo[]) =>
      dependencies.getSessionTodoStateService().hasIncompleteTodos(todos),
    refreshPendingQuestionsForTab: (
      tabId: TabId | null,
      sessionId: string | null | undefined,
    ) =>
      dependencies
        .getQuestionDockCoordinator()
        .refreshPendingQuestionsForTab(tabId, sessionId),
    refreshTabSessionStatus: (
      tabId: TabId | null,
      sessionId: string | null | undefined,
      options: { suppressErrors?: boolean },
    ) =>
      dependencies
        .getSessionTodoStatusRefreshService()
        .refreshTabSessionStatus(tabId, sessionId, options),
    refreshTabSessionTodos: (
      tabId: TabId | null,
      sessionId: string | null | undefined,
      options: { suppressErrors?: boolean },
    ) =>
      dependencies
        .getSessionTodoStatusRefreshService()
        .refreshTabSessionTodos(tabId, sessionId, options),
    syncBackgroundTaskStateFromConversation: (
      conversation: Conversation,
      tabId?: TabId | null,
    ) => dependencies.viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId),
    refreshBackgroundTaskCompletionNotices: (
      tabId: TabId | null,
      conversation: Conversation | null,
    ) =>
      dependencies
        .getBackgroundTaskIndicatorCoordinator()
        .queueAndFlushCompletionNotices(tabId, conversation),
    syncTabStreamLikeState: (tabId: TabId | null) => {
      dependencies.getTabRuntimeStateBridge().syncStreamLikeState(tabId);
    },
    setCurrentConversationRevertState: (
      revertState: ConversationRevertStateSnapshot | null,
    ) => {
      dependencies.viewHost.setCurrentConversationRevertState(revertState);
    },
    setTabConversationSyncFingerprint: (tabId: TabId, fingerprint: string) => {
      dependencies.viewHost.setTabConversationSyncFingerprint(tabId, fingerprint);
    },
    markBackgroundTaskAuthoritativeSync: (tabId: TabId | null, reason: string) => {
      dependencies
        .getBackgroundTaskLiveSignalCoordinator()
        .markAuthoritativeSync(tabId, reason);
    },
    setTabNeedsAttention: (tabId: TabId | null, needsAttention: boolean) => {
      dependencies.getTabRuntimeStateBridge().setNeedsAttention(tabId, needsAttention);
    },
  };
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
