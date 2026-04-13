import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  createBackgroundConversationPostSyncHandoffServices,
  type BackgroundConversationPostSyncHandoffViewHost,
} from './BackgroundConversationPostSyncHandoffHostAdapter';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
} from './BackgroundConversationPostSyncHandoffCoordinator';
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
import type { SessionTodoCoordinator } from './SessionTodoCoordinator';
import {
  type VisibleConversationPostSyncStateCoordinator,
} from './VisibleConversationPostSyncStateCoordinator';
import {
  VisibleConversationPostSyncCoordinator,
} from './VisibleConversationPostSyncCoordinator';

type QuestionPendingRefreshPort = Pick<
  QuestionDockCoordinator,
  'refreshPendingQuestionsForTab'
>;
type SessionTodoCoordinatorPort = Pick<
  SessionTodoCoordinator,
  'hasIncompleteTodos' | 'refreshTabSessionStatus' | 'refreshTabSessionTodos'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): QuestionTodoStatusRefreshRuntime | null;
}

export interface QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies {
  viewHost: QuestionTodoBackgroundTaskRefreshViewHostAdapterHost;
  getQuestionDockCoordinator(): QuestionPendingRefreshPort;
  getSessionTodoCoordinator(): SessionTodoCoordinatorPort;
}

export interface QuestionTodoBackgroundTaskRefreshViewHost
  extends PostSyncQuestionTodoRefreshViewHost {}

export function createQuestionTodoBackgroundTaskRefreshViewHostAdapter(
  dependencies: QuestionTodoBackgroundTaskRefreshViewHostAdapterDependencies,
): QuestionTodoBackgroundTaskRefreshViewHost {
  return {
    getCurrentConversation: () => dependencies.viewHost.getCurrentConversation(),
    getTabRuntimeState: (tabId: TabId | null) =>
      dependencies.viewHost.getTabRuntimeState(tabId),
    hasIncompleteTodos: (todos: readonly SessionTodo[]) =>
      dependencies.getSessionTodoCoordinator().hasIncompleteTodos(todos),
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
        .getSessionTodoCoordinator()
        .refreshTabSessionStatus(tabId, sessionId, options),
    refreshTabSessionTodos: (
      tabId: TabId | null,
      sessionId: string | null | undefined,
      options: { suppressErrors?: boolean },
    ) =>
      dependencies
        .getSessionTodoCoordinator()
        .refreshTabSessionTodos(tabId, sessionId, options),
  };
}

export interface QuestionTodoBackgroundTaskRefreshHosts {
  questionTodoActivationRefreshHost: QuestionTodoActivationRefreshBridgeHost;
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
  };
}

export function createQuestionTodoBackgroundTaskRefreshServices(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
  backgroundConversationPostSyncHandoffViewHost:
    BackgroundConversationPostSyncHandoffViewHost,
  visibleConversationPostSyncStateCoordinator: VisibleConversationPostSyncStatePort,
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
  const visibleConversationPostSyncCoordinator =
    new VisibleConversationPostSyncCoordinator(
      postSyncQuestionTodoRefreshFacade,
      visibleConversationPostSyncStateCoordinator,
    );
  const { backgroundConversationPostSyncHandoffCoordinator } =
    createBackgroundConversationPostSyncHandoffServices(
      backgroundConversationPostSyncHandoffViewHost,
      postSyncQuestionTodoRefreshPlanBuilder,
      questionTodoStatusRefreshCoordinator,
    );
  return {
    questionTodoActivationRefreshBridge,
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshFacade,
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
  };
}
