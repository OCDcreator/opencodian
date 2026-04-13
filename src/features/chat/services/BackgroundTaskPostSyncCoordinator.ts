import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundConversationAttentionCoordinator } from './BackgroundConversationAttentionCoordinator';
import type { BackgroundConversationPostSyncRefreshExecutor } from './BackgroundConversationPostSyncRefreshExecutor';
import type { BackgroundConversationSignalSyncStateCoordinator } from './BackgroundConversationSignalSyncStateCoordinator';
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

type PostSyncQuestionTodoRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  | 'refreshVisibleConversation'
>;
type BackgroundConversationPostSyncRefreshPort = Pick<
  BackgroundConversationPostSyncRefreshExecutor,
  | 'refreshBackgroundTabConversation'
  | 'refreshSignalSyncedBackgroundConversation'
>;
type BackgroundConversationAttentionPort = Pick<
  BackgroundConversationAttentionCoordinator,
  | 'commitBackgroundTabSyncAttention'
  | 'commitSignalSyncAttention'
>;
type BackgroundConversationSignalSyncStatePort = Pick<
  BackgroundConversationSignalSyncStateCoordinator,
  'commitSignalSyncState'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

export interface BackgroundTaskPostSyncResult {
  changed: boolean;
  fingerprint: string;
}

interface BackgroundTaskPostSyncBaseOptions {
  tabId: TabId;
  conversation: Conversation;
  previousFingerprint: string;
  syncResult: BackgroundTaskPostSyncResult;
}

export interface SignalBackgroundTaskPostSyncOptions extends BackgroundTaskPostSyncBaseOptions {
  reason: string;
  activeTabId: TabId | null;
  tabHasBackgroundTask: boolean;
}

export type BackgroundTabPostSyncOptions = BackgroundTaskPostSyncBaseOptions;

export interface VisibleConversationPostSyncOptions {
  tabId: TabId;
  expectedConversationId: string;
  questionSessionId: string | null | undefined;
  syncResult: VisibleConversationPostSyncResult;
}

export class BackgroundTaskPostSyncCoordinator {
  constructor(
    private readonly postSyncQuestionTodoRefreshFacade: PostSyncQuestionTodoRefreshPort,
    private readonly backgroundConversationPostSyncRefresh:
      BackgroundConversationPostSyncRefreshPort,
    private readonly visibleConversationPostSyncState: VisibleConversationPostSyncStatePort,
    private readonly backgroundConversationSignalSyncState:
      BackgroundConversationSignalSyncStatePort,
    private readonly backgroundConversationAttention: BackgroundConversationAttentionPort,
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
    this.backgroundConversationSignalSyncState.commitSignalSyncState({
      tabId: options.tabId,
      reason: options.reason,
    });
    await this.backgroundConversationPostSyncRefresh.refreshSignalSyncedBackgroundConversation({
      tabId: options.tabId,
      conversation: options.conversation,
      tabHasBackgroundTask: options.tabHasBackgroundTask,
    });
    this.backgroundConversationAttention.commitSignalSyncAttention({
      tabId: options.tabId,
      activeTabId: options.activeTabId,
      previousFingerprint: options.previousFingerprint,
      syncResult: options.syncResult,
    });
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.backgroundConversationPostSyncRefresh.refreshBackgroundTabConversation({
      tabId: options.tabId,
      conversation: options.conversation,
    });
    this.backgroundConversationAttention.commitBackgroundTabSyncAttention({
      tabId: options.tabId,
      previousFingerprint: options.previousFingerprint,
      syncResult: options.syncResult,
    });
  }
}
