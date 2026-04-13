import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  BackgroundTabConversationRefreshPlanOptions,
  PostSyncQuestionTodoRefreshPlanBuilder,
  SignalSyncedBackgroundConversationRefreshPlanOptions,
  VisibleConversationRefreshPlanOptions,
} from './PostSyncQuestionTodoRefreshPlanBuilder';
import type {
  PostSyncQuestionTodoStatusRefreshOptions,
  QuestionTodoStatusRefreshCoordinator,
} from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;
type PostSyncQuestionTodoRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createBackgroundTabConversationPlan'
  | 'createSignalSyncedBackgroundConversationPlan'
  | 'createVisibleConversationPlan'
>;

export interface BackgroundTaskPostSyncRefreshPort {
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
  flushBackgroundTaskPostSyncWriteback(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void>;
}

export type VisibleConversationRefreshOptions = VisibleConversationRefreshPlanOptions;
export type SignalSyncedBackgroundConversationRefreshOptions =
  SignalSyncedBackgroundConversationRefreshPlanOptions;
export type BackgroundTabConversationRefreshOptions =
  BackgroundTabConversationRefreshPlanOptions;

export class PostSyncQuestionTodoRefreshFacade {
  constructor(
    private readonly refreshPlanBuilder: PostSyncQuestionTodoRefreshPlanPort,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
    private readonly backgroundTaskPostSyncRefresh: BackgroundTaskPostSyncRefreshPort,
  ) {}

  async refreshVisibleConversation(
    options: VisibleConversationRefreshOptions,
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync(
      this.refreshPlanBuilder.createVisibleConversationPlan(options),
    );
  }

  async refreshSignalSyncedBackgroundConversation(
    options: SignalSyncedBackgroundConversationRefreshOptions,
  ): Promise<void> {
    await this.refreshBackgroundConversation(
      options.tabId,
      options.conversation,
      this.refreshPlanBuilder.createSignalSyncedBackgroundConversationPlan(options),
    );
  }

  async refreshBackgroundTabConversation(
    options: BackgroundTabConversationRefreshOptions,
  ): Promise<void> {
    await this.refreshBackgroundConversation(
      options.tabId,
      options.conversation,
      this.refreshPlanBuilder.createBackgroundTabConversationPlan(options),
    );
  }

  private async refreshBackgroundConversation(
    tabId: TabId,
    conversation: Conversation,
    refreshPlan: PostSyncQuestionTodoStatusRefreshOptions,
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
      ...refreshPlan,
      afterPendingQuestionRefresh: () => {
        this.backgroundTaskPostSyncRefresh.syncBackgroundTaskStateFromConversation(
          conversation,
          tabId,
        );
      },
    });

    await this.backgroundTaskPostSyncRefresh.flushBackgroundTaskPostSyncWriteback(
      tabId,
      conversation,
    );
  }
}
