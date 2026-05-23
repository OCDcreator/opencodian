import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  BackgroundTabConversationRefreshPlanOptions,
  PostSyncQuestionTodoRefreshPlanBuilder,
  SignalSyncedBackgroundConversationRefreshPlanOptions,
} from './PostSyncQuestionTodoRefreshPlanBuilder';
import type {
  PostSyncQuestionTodoStatusRefreshOptions,
  QuestionTodoStatusRefreshCoordinator,
} from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;
type BackgroundConversationRefreshPlanPort = Pick<
  PostSyncQuestionTodoRefreshPlanBuilder,
  | 'createBackgroundTabConversationPlan'
  | 'createSignalSyncedBackgroundConversationPlan'
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

export type SignalSyncedBackgroundConversationRefreshOptions =
  SignalSyncedBackgroundConversationRefreshPlanOptions;
export type BackgroundTabConversationRefreshOptions =
  BackgroundTabConversationRefreshPlanOptions;

export class BackgroundConversationPostSyncRefreshExecutor {
  constructor(
    private readonly refreshPlanBuilder: BackgroundConversationRefreshPlanPort,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
    private readonly backgroundTaskPostSyncRefresh: BackgroundTaskPostSyncRefreshPort,
  ) {}

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
    refreshPlan: PostSyncQuestionTodoStatusRefreshOptions | null,
  ): Promise<void> {
    // Backend gate: when the plan builder returns null (non-OpenCode conversation),
    // skip question/todo refresh but still flush background-task writeback.
    if (refreshPlan) {
      await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
        ...refreshPlan,
        afterPendingQuestionRefresh: () => {
          this.backgroundTaskPostSyncRefresh.syncBackgroundTaskStateFromConversation(
            conversation,
            tabId,
          );
        },
      });
    }

    await this.backgroundTaskPostSyncRefresh.flushBackgroundTaskPostSyncWriteback(
      tabId,
      conversation,
    );
  }
}
