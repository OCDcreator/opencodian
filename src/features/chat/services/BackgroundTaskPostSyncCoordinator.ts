import type { Conversation } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionTodoStatusRefreshCoordinator } from './QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

export interface BackgroundTaskPostSyncResult {
  changed: boolean;
  fingerprint: string;
}

export interface ConversationRevertStateSnapshot {
  messageID: string;
  partID?: string;
}

export interface VisibleConversationPostSyncResult extends BackgroundTaskPostSyncResult {
  revertState: ConversationRevertStateSnapshot | null;
}

export interface BackgroundTaskPostSyncCoordinatorHost {
  getCurrentConversationId(): string | null;
  getCurrentConversationSessionId(): string | undefined;
  setCurrentConversationRevertState(revertState: ConversationRevertStateSnapshot | null): void;
  setTabConversationSyncFingerprint(tabId: TabId, fingerprint: string): void;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId?: TabId | null): void;
  refreshBackgroundTaskCompletionNotices(tabId: TabId | null, conversation: Conversation | null): Promise<void>;
  syncTabStreamLikeState(tabId: TabId | null): void;
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

export interface VisibleConversationPostSyncOutcome {
  shouldApplySyncedConversationUpdate: boolean;
  shouldRenderBackgroundTaskIndicator: boolean;
}

export class BackgroundTaskPostSyncCoordinator {
  constructor(
    private readonly host: BackgroundTaskPostSyncCoordinatorHost,
    private readonly questionTodoStatusRefreshCoordinator: QuestionTodoStatusRefreshPort,
  ) {}

  async handleVisibleConversationSyncComplete(
    options: VisibleConversationPostSyncOptions,
  ): Promise<VisibleConversationPostSyncOutcome> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
      tabId: options.tabId,
      questionSessionId: options.questionSessionId,
      todoStatusSessionId: this.host.getCurrentConversationSessionId(),
    });

    const currentConversationMatchesExpected =
      this.host.getCurrentConversationId() === options.expectedConversationId;
    if (currentConversationMatchesExpected) {
      this.host.setCurrentConversationRevertState(options.syncResult.revertState);
      if (options.syncResult.changed) {
        this.host.setTabConversationSyncFingerprint(options.tabId, options.syncResult.fingerprint);
      }
    }

    return {
      shouldApplySyncedConversationUpdate:
        currentConversationMatchesExpected && options.syncResult.changed,
      shouldRenderBackgroundTaskIndicator:
        !currentConversationMatchesExpected || !options.syncResult.changed,
    };
  }

  async handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void> {
    this.host.markBackgroundTaskAuthoritativeSync(options.tabId, `sync-event:${options.reason}`);
    await this.refreshPostSyncState(options.tabId, options.conversation, {
      shouldRefreshTodoStatus: options.tabHasBackgroundTask,
    });

    if (this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      this.host.setTabNeedsAttention(options.tabId, options.tabId !== options.activeTabId);
    }
  }

  async handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void> {
    await this.refreshPostSyncState(options.tabId, options.conversation, {
      shouldRefreshTodoStatus: true,
    });

    if (this.didConversationChange(options.syncResult, options.previousFingerprint)) {
      this.host.setTabNeedsAttention(options.tabId, true);
    }
  }

  private async refreshPostSyncState(
    tabId: TabId,
    conversation: Conversation,
    options: { shouldRefreshTodoStatus: boolean },
  ): Promise<void> {
    await this.questionTodoStatusRefreshCoordinator.refreshAfterPostSync({
      tabId,
      questionSessionId: conversation.openCodeSessionId,
      todoStatusSessionId: conversation.openCodeSessionId,
      forceTodoStatusRefresh: options.shouldRefreshTodoStatus,
      afterPendingQuestionRefresh: () => {
        this.host.syncBackgroundTaskStateFromConversation(conversation, tabId);
      },
    });

    await this.host.refreshBackgroundTaskCompletionNotices(tabId, conversation);
    this.host.syncTabStreamLikeState(tabId);
  }

  private didConversationChange(
    syncResult: BackgroundTaskPostSyncResult,
    previousFingerprint: string,
  ): boolean {
    return syncResult.changed || syncResult.fingerprint !== previousFingerprint;
  }
}
