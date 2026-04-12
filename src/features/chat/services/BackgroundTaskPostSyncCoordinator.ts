import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';

export interface BackgroundTaskPostSyncRuntime {
  sessionTodos: readonly SessionTodo[];
  backgroundTaskLaunches: ReadonlyMap<string, unknown>;
  backgroundTaskWaitingForFollowUp: boolean;
}

export interface BackgroundTaskPostSyncResult {
  changed: boolean;
  fingerprint: string;
}

export interface BackgroundTaskPostSyncCoordinatorHost {
  getCurrentConversationId(): string | null;
  getCurrentConversationSessionId(): string | undefined;
  getTabRuntimeState(tabId: TabId | null): BackgroundTaskPostSyncRuntime | null;
  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined,
  ): Promise<QuestionRequest[]>;
  syncBackgroundTaskStateFromConversation(conversation: Conversation, tabId?: TabId | null): void;
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionActivityStatus | null>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
  queueBackgroundTaskCompletionNotices(tabId: TabId | null, conversation: Conversation | null): Promise<void>;
  flushQueuedBackgroundTaskCompletionNotices(tabId: TabId | null, conversation: Conversation | null): Promise<void>;
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
  syncResult: BackgroundTaskPostSyncResult;
}

export interface VisibleConversationPostSyncOutcome {
  currentConversationMatchesExpected: boolean;
  shouldApplySyncedConversationUpdate: boolean;
  shouldRenderBackgroundTaskIndicator: boolean;
}

export class BackgroundTaskPostSyncCoordinator {
  constructor(private readonly host: BackgroundTaskPostSyncCoordinatorHost) {}

  async handleVisibleConversationSyncComplete(
    options: VisibleConversationPostSyncOptions,
  ): Promise<VisibleConversationPostSyncOutcome> {
    await this.host.refreshPendingQuestionsForTab(options.tabId, options.questionSessionId);

    const currentConversationMatchesExpected =
      this.host.getCurrentConversationId() === options.expectedConversationId;
    await this.refreshVisibleConversationTodoStatus(options.tabId);

    return {
      currentConversationMatchesExpected,
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

  private async refreshVisibleConversationTodoStatus(
    tabId: TabId,
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (
      !runtime
      || (
        !this.host.hasIncompleteTodos(runtime.sessionTodos)
        && runtime.backgroundTaskLaunches.size === 0
        && !runtime.backgroundTaskWaitingForFollowUp
      )
    ) {
      return;
    }

    await this.host.refreshTabSessionStatus(tabId, this.host.getCurrentConversationSessionId(), {
      suppressErrors: true,
    });
    await this.host.refreshTabSessionTodos(tabId, this.host.getCurrentConversationSessionId(), {
      suppressErrors: true,
    });
  }

  private async refreshPostSyncState(
    tabId: TabId,
    conversation: Conversation,
    options: { shouldRefreshTodoStatus: boolean },
  ): Promise<void> {
    await this.host.refreshPendingQuestionsForTab(tabId, conversation.openCodeSessionId);
    this.host.syncBackgroundTaskStateFromConversation(conversation, tabId);

    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime && (this.host.hasIncompleteTodos(runtime.sessionTodos) || options.shouldRefreshTodoStatus)) {
      await this.host.refreshTabSessionStatus(tabId, conversation.openCodeSessionId, { suppressErrors: true });
      await this.host.refreshTabSessionTodos(tabId, conversation.openCodeSessionId, { suppressErrors: true });
    }

    await this.host.queueBackgroundTaskCompletionNotices(tabId, conversation);
    await this.host.flushQueuedBackgroundTaskCompletionNotices(tabId, conversation);
    this.host.syncTabStreamLikeState(tabId);
  }

  private didConversationChange(
    syncResult: BackgroundTaskPostSyncResult,
    previousFingerprint: string,
  ): boolean {
    return syncResult.changed || syncResult.fingerprint !== previousFingerprint;
  }
}
