import type { TabId } from '../tabs';
import type { PostSyncQuestionTodoRefreshFacade } from './PostSyncQuestionTodoRefreshFacade';
import type {
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
  VisibleConversationPostSyncStateCoordinator,
} from './VisibleConversationPostSyncStateCoordinator';

type PostSyncQuestionTodoRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  'refreshVisibleConversation'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

export interface VisibleConversationPostSyncOptions {
  tabId: TabId;
  expectedConversationId: string;
  questionSessionId: string | null | undefined;
  syncResult: VisibleConversationPostSyncResult;
}

export class VisibleConversationPostSyncCoordinator {
  constructor(
    private readonly postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshPort,
    private readonly visibleConversationPostSyncState: VisibleConversationPostSyncStatePort,
  ) {}

  async handleVisibleConversationSyncComplete(
    options: VisibleConversationPostSyncOptions,
  ): Promise<VisibleConversationPostSyncOutcome> {
    await this.postSyncQuestionTodoRefreshFacade.refreshVisibleConversation({
      tabId: options.tabId,
      questionSessionId: options.questionSessionId,
    });

    return this.visibleConversationPostSyncState.commitPostSyncState({
      tabId: options.tabId,
      expectedConversationId: options.expectedConversationId,
      syncResult: options.syncResult,
    });
  }
}

export type {
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
} from './VisibleConversationPostSyncStateCoordinator';
