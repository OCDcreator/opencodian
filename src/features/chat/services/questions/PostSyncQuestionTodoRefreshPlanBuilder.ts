import type { Conversation } from '../../../../core/types';
import { getConversationBackendSessionId } from '../../../../core/types';
import type { TabId } from '../../tabs';
import type { PostSyncQuestionTodoStatusRefreshOptions } from './QuestionTodoStatusRefreshCoordinator';

export interface PostSyncQuestionTodoRefreshPlanBuilderHost {
  getCurrentConversationSessionId(): string | null | undefined;
}

export interface VisibleConversationRefreshPlanOptions {
  tabId: TabId;
  questionSessionId: string | null | undefined;
  isCurrent?: () => boolean;
}

export interface SignalSyncedBackgroundConversationRefreshPlanOptions {
  tabId: TabId;
  conversation: Conversation;
  tabHasBackgroundTask: boolean;
  isCurrent?: () => boolean;
}

export interface BackgroundTabConversationRefreshPlanOptions {
  tabId: TabId;
  conversation: Conversation;
  isCurrent?: () => boolean;
}

export class PostSyncQuestionTodoRefreshPlanBuilder {
  constructor(private readonly host: PostSyncQuestionTodoRefreshPlanBuilderHost) {}

  createVisibleConversationPlan(
    options: VisibleConversationRefreshPlanOptions,
  ): PostSyncQuestionTodoStatusRefreshOptions {
    return {
      tabId: options.tabId,
      questionSessionId: options.questionSessionId,
      todoStatusSessionId: this.host.getCurrentConversationSessionId(),
      isCurrent: options.isCurrent,
    };
  }

  createSignalSyncedBackgroundConversationPlan(
    options: SignalSyncedBackgroundConversationRefreshPlanOptions,
  ): PostSyncQuestionTodoStatusRefreshOptions | null {
    return this.createBackgroundConversationPlan(
      options.tabId,
      options.conversation,
      options.tabHasBackgroundTask,
    );
  }

  createBackgroundTabConversationPlan(
    options: BackgroundTabConversationRefreshPlanOptions,
  ): PostSyncQuestionTodoStatusRefreshOptions | null {
    return this.createBackgroundConversationPlan(
      options.tabId,
      options.conversation,
      true,
    );
  }

  private createBackgroundConversationPlan(
    tabId: TabId,
    conversation: Conversation,
    forceTodoStatusRefresh: boolean,
  ): PostSyncQuestionTodoStatusRefreshOptions | null {
    // DSH has a native todo contract. The downstream coordinator checks its
    // live capability; question/status calls keep their separate backend gates.
    const backend = conversation.backend ?? 'opencode';
    if (backend !== 'opencode' && backend !== 'dsh') {
      return null;
    }

    return {
      tabId,
      questionSessionId: getConversationBackendSessionId(conversation),
      todoStatusSessionId: getConversationBackendSessionId(conversation),
      forceTodoStatusRefresh,
    };
  }
}
