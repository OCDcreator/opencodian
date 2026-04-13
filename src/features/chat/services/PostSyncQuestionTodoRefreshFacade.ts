import type {
  PostSyncQuestionTodoRefreshPlanBuilder,
  VisibleConversationRefreshPlanOptions,
} from './PostSyncQuestionTodoRefreshPlanBuilder';
import type { QuestionTodoStatusRefreshCoordinator } from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;
type VisibleConversationRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createVisibleConversationPlan'
>;

export type VisibleConversationRefreshOptions = VisibleConversationRefreshPlanOptions;

export class PostSyncQuestionTodoRefreshFacade {
  constructor(
    private readonly refreshPlanBuilder: VisibleConversationRefreshPlanPort,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
  ) {}

  async refreshVisibleConversation(
    options: VisibleConversationRefreshOptions,
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync(
      this.refreshPlanBuilder.createVisibleConversationPlan(options),
    );
  }
}
