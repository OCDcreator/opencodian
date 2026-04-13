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
  BackgroundConversationAttentionCoordinator,
  type BackgroundConversationAttentionCoordinatorHost,
} from './BackgroundConversationAttentionCoordinator';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundConversationPostSyncRefreshExecutor,
  type BackgroundTaskPostSyncRefreshPort,
} from './BackgroundConversationPostSyncRefreshExecutor';
import {
  BackgroundConversationSignalSyncStateCoordinator,
  type BackgroundConversationSignalSyncStateCoordinatorHost,
} from './BackgroundConversationSignalSyncStateCoordinator';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import type { PostSyncQuestionTodoRefreshFacade } from './PostSyncQuestionTodoRefreshFacade';
import {
  createPostSyncQuestionTodoRefreshServices,
  type PostSyncQuestionTodoRefreshViewHost,
} from './PostSyncQuestionTodoRefreshHostAdapter';
import {
  QuestionTodoActivationRefreshBridge,
  type QuestionTodoActivationRefreshBridgeHost,
} from './QuestionTodoActivationRefreshBridge';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import type {
  QuestionTodoStatusRefreshCoordinator,
  QuestionTodoStatusRefreshRuntime,
} from './QuestionTodoStatusRefreshCoordinator';
import type { SessionTodoStateService } from './SessionTodoStateService';
import type { SessionTodoStatusRefreshService } from './SessionTodoStatusRefreshService';
import {
  type ConversationRevertStateSnapshot,
  VisibleConversationPostSyncStateCoordinator,
  type VisibleConversationPostSyncStateCoordinatorHost,
} from './VisibleConversationPostSyncStateCoordinator';
import {
  VisibleConversationPostSyncCoordinator,
} from './VisibleConversationPostSyncCoordinator';

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
  'flushCompletionNoticesAndSyncStreamLikeState'
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

export interface QuestionTodoBackgroundTaskRefreshViewHost
  extends PostSyncQuestionTodoRefreshViewHost {
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  flushBackgroundTaskPostSyncWriteback(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void>;
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
    flushBackgroundTaskPostSyncWriteback: (
      tabId: TabId | null,
      conversation: Conversation | null,
    ) =>
      dependencies
        .getBackgroundTaskIndicatorCoordinator()
        .flushCompletionNoticesAndSyncStreamLikeState(tabId, conversation),
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
  questionTodoActivationRefreshHost: QuestionTodoActivationRefreshBridgeHost;
  backgroundTaskPostSyncRefreshPort: BackgroundTaskPostSyncRefreshPort;
  visibleConversationPostSyncStateCoordinatorHost: VisibleConversationPostSyncStateCoordinatorHost;
  backgroundConversationAttentionCoordinatorHost: BackgroundConversationAttentionCoordinatorHost;
  backgroundConversationSignalSyncStateCoordinatorHost:
    BackgroundConversationSignalSyncStateCoordinatorHost;
}

export interface QuestionTodoBackgroundTaskRefreshServices {
  questionTodoActivationRefreshBridge: QuestionTodoActivationRefreshBridge;
  questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshCoordinator;
  postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshFacade;
  visibleConversationPostSyncCoordinator: VisibleConversationPostSyncCoordinator;
  backgroundConversationPostSyncHandoffCoordinator:
    BackgroundConversationPostSyncHandoffCoordinator;
}

export function createQuestionTodoBackgroundTaskRefreshHosts(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
): QuestionTodoBackgroundTaskRefreshHosts {
  return {
    questionTodoActivationRefreshHost: {
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
    backgroundTaskPostSyncRefreshPort: {
      syncBackgroundTaskStateFromConversation: (
        conversation: Conversation,
        tabId?: TabId | null,
      ) => viewHost.syncBackgroundTaskStateFromConversation(conversation, tabId),
      flushBackgroundTaskPostSyncWriteback: (
        tabId: TabId | null,
        conversation: Conversation | null,
      ) => viewHost.flushBackgroundTaskPostSyncWriteback(tabId, conversation),
    },
    visibleConversationPostSyncStateCoordinatorHost: {
      getCurrentConversationId: () => viewHost.getCurrentConversation()?.id ?? null,
      setCurrentConversationRevertState: (
        revertState: ConversationRevertStateSnapshot | null,
      ) => {
        viewHost.setCurrentConversationRevertState(revertState);
      },
      setTabConversationSyncFingerprint: (tabId: TabId, fingerprint: string) => {
        viewHost.setTabConversationSyncFingerprint(tabId, fingerprint);
      },
    },
    backgroundConversationAttentionCoordinatorHost: {
      setTabNeedsAttention: (tabId: TabId | null, needsAttention: boolean) =>
        viewHost.setTabNeedsAttention(tabId, needsAttention),
    },
    backgroundConversationSignalSyncStateCoordinatorHost: {
      markBackgroundTaskAuthoritativeSync: (tabId: TabId | null, reason: string) => {
        viewHost.markBackgroundTaskAuthoritativeSync(tabId, reason);
      },
    },
  };
}

export function createQuestionTodoBackgroundTaskRefreshServices(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
): QuestionTodoBackgroundTaskRefreshServices {
  const hosts = createQuestionTodoBackgroundTaskRefreshHosts(viewHost);
  const {
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshPlanBuilder,
    postSyncQuestionTodoRefreshFacade,
  } = createPostSyncQuestionTodoRefreshServices(viewHost);
  const questionTodoActivationRefreshBridge = new QuestionTodoActivationRefreshBridge(
    hosts.questionTodoActivationRefreshHost,
  );
  const backgroundConversationPostSyncRefreshExecutor =
    new BackgroundConversationPostSyncRefreshExecutor(
      postSyncQuestionTodoRefreshPlanBuilder,
      questionTodoStatusRefreshCoordinator,
      hosts.backgroundTaskPostSyncRefreshPort,
    );
  const visibleConversationPostSyncStateCoordinator =
    new VisibleConversationPostSyncStateCoordinator(
      hosts.visibleConversationPostSyncStateCoordinatorHost,
    );
  const visibleConversationPostSyncCoordinator =
    new VisibleConversationPostSyncCoordinator(
      postSyncQuestionTodoRefreshFacade,
      visibleConversationPostSyncStateCoordinator,
    );
  const backgroundConversationAttentionCoordinator =
    new BackgroundConversationAttentionCoordinator(
      hosts.backgroundConversationAttentionCoordinatorHost,
    );
  const backgroundConversationSignalSyncStateCoordinator =
    new BackgroundConversationSignalSyncStateCoordinator(
      hosts.backgroundConversationSignalSyncStateCoordinatorHost,
    );
  const backgroundConversationPostSyncHandoffCoordinator =
    new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundConversationPostSyncRefreshExecutor,
      backgroundConversationSignalSyncStateCoordinator,
      backgroundConversationAttentionCoordinator,
    );
  return {
    questionTodoActivationRefreshBridge,
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshFacade,
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
  };
}
