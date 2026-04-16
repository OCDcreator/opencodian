import type {
  Conversation,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import {
  type BackgroundConversationPostSyncHandoffViewHost,
  createBackgroundConversationPostSyncHandoffServices,
} from './BackgroundConversationPostSyncHandoffHostAdapter';
import type { PostSyncQuestionTodoRefreshFacade } from './PostSyncQuestionTodoRefreshFacade';
import {
  createPostSyncQuestionTodoRefreshServices,
  type PostSyncQuestionTodoRefreshViewHost,
} from './PostSyncQuestionTodoRefreshHostAdapter';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import type {
  QuestionTodoStatusRefreshCoordinator,
  QuestionTodoStatusRefreshRuntime,
} from './QuestionTodoStatusRefreshCoordinator';
import type { SessionTodoCoordinator } from './SessionTodoCoordinator';
import {
  VisibleConversationPostSyncCoordinator,
} from './VisibleConversationPostSyncCoordinator';
import {
  type VisibleConversationPostSyncStateCoordinator,
} from './VisibleConversationPostSyncStateCoordinator';

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

export type QuestionTodoBackgroundTaskRefreshViewHost = PostSyncQuestionTodoRefreshViewHost;

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

export interface QuestionTodoBackgroundTaskRefreshServices {
  questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshCoordinator;
  postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshFacade;
  visibleConversationPostSyncCoordinator: VisibleConversationPostSyncCoordinator;
  backgroundConversationPostSyncHandoffCoordinator:
    BackgroundConversationPostSyncHandoffCoordinator;
}

export function createQuestionTodoBackgroundTaskRefreshServices(
  viewHost: QuestionTodoBackgroundTaskRefreshViewHost,
  backgroundConversationPostSyncHandoffViewHost:
    BackgroundConversationPostSyncHandoffViewHost,
  visibleConversationPostSyncStateCoordinator: VisibleConversationPostSyncStatePort,
): QuestionTodoBackgroundTaskRefreshServices {
  const {
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshPlanBuilder,
    postSyncQuestionTodoRefreshFacade,
  } = createPostSyncQuestionTodoRefreshServices(viewHost);
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
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshFacade,
    visibleConversationPostSyncCoordinator,
    backgroundConversationPostSyncHandoffCoordinator,
  };
}
