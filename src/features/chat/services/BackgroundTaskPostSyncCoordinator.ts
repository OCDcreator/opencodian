import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
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
  'refreshBackgroundConversation' | 'refreshVisibleConversation'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

export interface BackgroundTaskPostSyncResult {
  changed: boolean;
  fingerprint: string;
}

export interface BackgroundTaskPostSyncCoordinatorHost {
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
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
    private readonly host: BackgroundTaskPostSyncCoordinatorHost,
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

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    this.host.markBackgroundTaskAuthoritativeSync(options.tabId, `sync-event:${options.reason}`);
    await this.postSyncQuestionTodoRefreshFacade.refreshBackgroundConversation({
      tabId: options.tabId,
      conversation: options.conversation,
      todoStatusRefreshPolicy: {
        source: 'signal-sync',
        tabHasBackgroundTask: options.tabHasBackgroundTask,
      },
    });

    if (this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      this.host.setTabNeedsAttention(options.tabId, options.tabId !== options.activeTabId);
    }
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.postSyncQuestionTodoRefreshFacade.refreshBackgroundConversation({
      tabId: options.tabId,
      conversation: options.conversation,
      todoStatusRefreshPolicy: {
        source: 'background-tab',
      },
    });

    if (this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      this.host.setTabNeedsAttention(options.tabId, true);
    }
  }

  private didConversationChange(
    syncResult: BackgroundTaskPostSyncResult,
    previousFingerprint: string,
  ): boolean {
    return syncResult.changed || syncResult.fingerprint !== previousFingerprint;
  }
}
