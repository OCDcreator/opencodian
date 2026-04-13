import type { TabId } from '../tabs';
import type {
  BackgroundConversationPostSyncHandoffCoordinator,
  BackgroundTabPostSyncOptions,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import type { PostSyncQuestionTodoRefreshFacade } from './PostSyncQuestionTodoRefreshFacade';
import type {
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
  VisibleConversationPostSyncStateCoordinator,
} from './VisibleConversationPostSyncStateCoordinator';

export type {
  ConversationRevertStateSnapshot,
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
} from './VisibleConversationPostSyncStateCoordinator';
export type {
  BackgroundTabPostSyncOptions,
  BackgroundTaskPostSyncResult,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundConversationPostSyncHandoffCoordinator';

type PostSyncQuestionTodoRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  | 'refreshVisibleConversation'
>;
type BackgroundConversationPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  | 'handleBackgroundTabSyncComplete'
  | 'handleSignalSyncComplete'
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

export class BackgroundTaskPostSyncCoordinator {
  constructor(
    private readonly postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshPort,
    private readonly visibleConversationPostSyncState: VisibleConversationPostSyncStatePort,
    private readonly backgroundConversationPostSyncHandoff:
      BackgroundConversationPostSyncHandoffPort,
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

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleSignalSyncComplete(options);
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncHandoff.handleBackgroundTabSyncComplete(options);
  }
}
