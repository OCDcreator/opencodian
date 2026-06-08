import type { Conversation } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import type { TabId } from '../tabs';
import type { PostSyncQuestionTodoStatusRefreshOptions } from './QuestionTodoStatusRefreshCoordinator';

export interface PostSyncQuestionTodoRefreshPlanBuilderHost {
  getCurrentConversationSessionId(): string | null | undefined;
}

export interface VisibleConversationRefreshPlanOptions {
  tabId: TabId;
  questionSessionId: string | null | undefined;
}

export interface SignalSyncedBackgroundConversationRefreshPlanOptions {
  tabId: TabId;
  conversation: Conversation;
  tabHasBackgroundTask: boolean;
}

export interface BackgroundTabConversationRefreshPlanOptions {
  tabId: TabId;
  conversation: Conversation;
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
    // Backend gate: question/todo refresh is an OpenCode-only feature.
    // Non-OpenCode conversations have no server-side question or todo API;
    // skip the entire refresh plan rather than calling with wrong session identity.
    const backend = conversation.backend ?? 'opencode';
    if (backend !== 'opencode') {
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
