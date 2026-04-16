import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';
import { PostSyncQuestionTodoRefreshFacade } from './PostSyncQuestionTodoRefreshFacade';
import {
  PostSyncQuestionTodoRefreshPlanBuilder,
  type PostSyncQuestionTodoRefreshPlanBuilderHost,
} from './PostSyncQuestionTodoRefreshPlanBuilder';
import {
  QuestionTodoStatusRefreshCoordinator,
  type QuestionTodoStatusRefreshCoordinatorHost,
  type QuestionTodoStatusRefreshRuntime,
} from './QuestionTodoStatusRefreshCoordinator';

export interface PostSyncQuestionTodoRefreshViewHost {
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
}

export interface PostSyncQuestionTodoRefreshHosts {
  questionTodoStatusRefreshHost: QuestionTodoStatusRefreshCoordinatorHost;
  postSyncQuestionTodoRefreshPlanBuilderHost: PostSyncQuestionTodoRefreshPlanBuilderHost;
}

export interface PostSyncQuestionTodoRefreshServices {
  questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshCoordinator;
  postSyncQuestionTodoRefreshPlanBuilder: PostSyncQuestionTodoRefreshPlanBuilder;
  postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshFacade;
}

export function createPostSyncQuestionTodoRefreshHosts(
  viewHost: PostSyncQuestionTodoRefreshViewHost,
): PostSyncQuestionTodoRefreshHosts {
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
    postSyncQuestionTodoRefreshPlanBuilderHost: {
      getCurrentConversationSessionId: () =>
        viewHost.getCurrentConversation()?.openCodeSessionId,
    },
  };
}

export function createPostSyncQuestionTodoRefreshServices(
  viewHost: PostSyncQuestionTodoRefreshViewHost,
): PostSyncQuestionTodoRefreshServices {
  const hosts = createPostSyncQuestionTodoRefreshHosts(viewHost);
  const questionTodoStatusRefreshCoordinator = new QuestionTodoStatusRefreshCoordinator(
    hosts.questionTodoStatusRefreshHost,
  );
  const postSyncQuestionTodoRefreshPlanBuilder = new PostSyncQuestionTodoRefreshPlanBuilder(
    hosts.postSyncQuestionTodoRefreshPlanBuilderHost,
  );
  const postSyncQuestionTodoRefreshFacade = new PostSyncQuestionTodoRefreshFacade(
    postSyncQuestionTodoRefreshPlanBuilder,
    questionTodoStatusRefreshCoordinator,
  );

  return {
    questionTodoStatusRefreshCoordinator,
    postSyncQuestionTodoRefreshPlanBuilder,
    postSyncQuestionTodoRefreshFacade,
  };
}
