import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionTodoStatusRefreshCoordinator } from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

export interface PostSyncQuestionTodoRefreshFacadeHost {
  getCurrentConversationSessionId(): string | null | undefined;
  syncBackgroundTaskStateFromConversation(
    conversation: Conversation,
    tabId?: TabId | null,
  ): void;
}

export interface BackgroundTaskPostSyncWritebackPort {
  flushBackgroundTaskPostSyncWriteback(
    tabId: TabId | null,
    conversation: Conversation | null,
  ): Promise<void>;
}

export interface VisibleConversationRefreshOptions {
  tabId: TabId;
  questionSessionId: string | null | undefined;
}

export interface BackgroundConversationRefreshOptions {
  tabId: TabId;
  conversation: Conversation;
  forceTodoStatusRefresh: boolean;
}

export class PostSyncQuestionTodoRefreshFacade {
  constructor(
    private readonly host: PostSyncQuestionTodoRefreshFacadeHost,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
    private readonly backgroundTaskPostSyncWriteback: BackgroundTaskPostSyncWritebackPort,
  ) {}

  async refreshVisibleConversation(
    options: VisibleConversationRefreshOptions,
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
      tabId: options.tabId,
      questionSessionId: options.questionSessionId,
      todoStatusSessionId: this.host.getCurrentConversationSessionId(),
    });
  }

  async refreshBackgroundConversation(
    options: BackgroundConversationRefreshOptions,
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
      tabId: options.tabId,
      questionSessionId: options.conversation.openCodeSessionId,
      todoStatusSessionId: options.conversation.openCodeSessionId,
      forceTodoStatusRefresh: options.forceTodoStatusRefresh,
      afterPendingQuestionRefresh: () => {
        this.host.syncBackgroundTaskStateFromConversation(
          options.conversation,
          options.tabId,
        );
      },
    });

    await this.backgroundTaskPostSyncWriteback.flushBackgroundTaskPostSyncWriteback(
      options.tabId,
      options.conversation,
    );
  }
}
