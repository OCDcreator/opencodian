import { PostSyncQuestionTodoRefreshFacade } from '../../../../src/features/chat/services/questions/PostSyncQuestionTodoRefreshFacade';
import type {
  PostSyncQuestionTodoRefreshPlanBuilder,
  VisibleConversationRefreshPlanOptions,
} from '../../../../src/features/chat/services/questions/PostSyncQuestionTodoRefreshPlanBuilder';
import type {
  PostSyncQuestionTodoStatusRefreshOptions,
  QuestionTodoStatusRefreshCoordinator,
} from '../../../../src/features/chat/services/questions/QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

type VisibleConversationRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createVisibleConversationPlan'
>;

function createPlanBuilder(): jest.Mocked<VisibleConversationRefreshPlanPort> {
  return {
    createVisibleConversationPlan: jest.fn(
      (options: VisibleConversationRefreshPlanOptions) => ({
        tabId: options.tabId,
        questionSessionId: options.questionSessionId,
        todoStatusSessionId: 'visible-todo-session',
      }),
    ),
  };
}

function createRefreshCoordinator(): jest.Mocked<QuestionTodoStatusRefreshPort> {
  return {
    refreshAfterPostSync: jest.fn(
      async (options: PostSyncQuestionTodoStatusRefreshOptions) => {
        await options.afterPendingQuestionRefresh?.();
      },
    ),
  };
}

describe('PostSyncQuestionTodoRefreshFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes visible conversations against the current live session id', async () => {
    const planBuilder = createPlanBuilder();
    const refreshCoordinator = createRefreshCoordinator();
    const facade = new PostSyncQuestionTodoRefreshFacade(planBuilder, refreshCoordinator);

    await facade.refreshVisibleConversation({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });

    expect(planBuilder.createVisibleConversationPlan).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
    });
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'question-session',
      todoStatusSessionId: 'visible-todo-session',
    });
  });
});
