import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type {
  TabSessionLifecycleState,
  WritableTabSessionPhase,
} from './TabSessionPhase';

const logger = createLogger('ConversationSyncRuntimeCoordinator');
type ConversationSyncTimerHandle = ReturnType<typeof setTimeout>;

/**
 * While a conversation hydration is rendering, visible/tab syncs must not
 * touch the messages DOM. Instead of dropping them, the sync is retried on a
 * bounded cadence until hydration settles; each retry re-validates that the
 * tab still hosts the same conversation before re-entering the lock.
 */
const HYDRATION_SYNC_DEFER_MS = 150;
const HYDRATION_SYNC_DEFER_MAX_ATTEMPTS = 40;

export interface ConversationSyncRuntime {
  isStreaming: boolean;
  isConversationSyncInFlight: boolean;
  isHydratingConversation: boolean;
  lastConversationSyncFingerprint: string | null;
  tabSessionLifecycle: TabSessionLifecycleState;
}

export interface ConversationSyncTabIdentity {
  conversationId: string | null;
}

export interface ConversationSyncRuntimeCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
  getTab(tabId: TabId | null): ConversationSyncTabIdentity | null;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  transitionTabSessionLifecycle(tabId: TabId | null, phase: WritableTabSessionPhase, reason: string): boolean;
}

export interface ConversationSyncTimeoutDiagnostic {
  readonly tabId: TabId;
  readonly conversationId: string;
  readonly openCodeSessionId?: string;
  readonly backendSessionId?: string;
  readonly ageMs: number;
  readonly phase: string;
  readonly reason: string | null;
  readonly isStreaming: boolean;
}

export interface ConversationSyncRuntimeCoordinatorOptions {
  readonly syncTimeoutMs?: number;
  readonly onSyncTimeout?: (diagnostic: ConversationSyncTimeoutDiagnostic) => void;
  readonly now?: () => number;
  readonly setTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ConversationSyncTimerHandle;
  readonly clearTimeout?: (handle: ConversationSyncTimerHandle) => void;
}

export interface VisibleConversationSyncContext {
  tabId: TabId;
  conversation: Conversation;
}

export interface TabConversationSyncContext extends VisibleConversationSyncContext {
  previousFingerprint: string;
}

interface HydrationDeferredSyncRequest {
  conversation: Conversation;
  callback: (context: VisibleConversationSyncContext & {
    runtime: ConversationSyncRuntime;
  }) => Promise<void>;
  attempt: number;
  requireActiveTab: boolean;
}

export class ConversationSyncRuntimeCoordinator {
  private readonly syncTimeoutMs: number;
  private readonly onSyncTimeout: (diagnostic: ConversationSyncTimeoutDiagnostic) => void;
  private readonly now: () => number;
  private readonly setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ConversationSyncTimerHandle;
  private readonly clearTimer: (handle: ConversationSyncTimerHandle) => void;
  /** Latest hydration-deferred sync request per tab; one retry timer per tab. */
  private readonly hydrationDeferredSyncByTabId = new Map<
    TabId,
    HydrationDeferredSyncRequest
  >();

  constructor(
    private readonly host: ConversationSyncRuntimeCoordinatorHost,
    options: ConversationSyncRuntimeCoordinatorOptions = {},
  ) {
    this.syncTimeoutMs = typeof options.syncTimeoutMs === 'number' && options.syncTimeoutMs > 0
      ? options.syncTimeoutMs
      : 20_000;
    this.onSyncTimeout = options.onSyncTimeout ?? ((diagnostic) => {
      logger.warn('Conversation sync lock is still pending', diagnostic);
    });
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  }

  async runVisibleConversationSync(
    conversation: Conversation | null,
    callback: (context: VisibleConversationSyncContext) => Promise<void>,
  ): Promise<boolean> {
    return this.withConversationSyncLock(
      this.host.getActiveTabId(),
      conversation,
      async ({ tabId, conversation: activeConversation }) => {
        await callback({
          tabId,
          conversation: activeConversation,
        });
      },
    );
  }

  /** Re-check ownership after an awaited network/canonical sync operation. */
  isVisibleConversationCurrent(context: VisibleConversationSyncContext): boolean {
    return this.host.getActiveTabId() === context.tabId
      && this.host.getTab(context.tabId)?.conversationId === context.conversation.id;
  }

  isTabConversationCurrent(context: VisibleConversationSyncContext): boolean {
    return this.host.getTab(context.tabId)?.conversationId === context.conversation.id;
  }

  async runTabConversationSync(
    options: {
      tabId: TabId | null;
      conversation: Conversation | null;
    },
    callback: (context: TabConversationSyncContext) => Promise<void>,
  ): Promise<boolean> {
    return this.withConversationSyncLock(
      options.tabId,
      options.conversation,
      async ({ tabId, conversation, runtime }) => {
        await callback({
          tabId,
          conversation,
          previousFingerprint: runtime.lastConversationSyncFingerprint
            ?? this.host.getConversationSyncFingerprint(conversation.messages),
        });
      },
    );
  }

  private async withConversationSyncLock(
    tabId: TabId | null,
    conversation: Conversation | null,
    callback: (context: VisibleConversationSyncContext & {
      runtime: ConversationSyncRuntime;
    }) => Promise<void>,
  ): Promise<boolean> {
    if (!tabId || !conversation || !getConversationBackendSessionId(conversation)) {
      return false;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming || runtime.isConversationSyncInFlight) {
      return false;
    }

    if (runtime.isHydratingConversation) {
      return this.deferConversationSyncUntilHydrationSettles(
        tabId,
        {
          conversation,
          callback,
          attempt: 1,
          requireActiveTab: tabId === this.host.getActiveTabId(),
        },
      );
    }

    runtime.isConversationSyncInFlight = true;
    this.host.transitionTabSessionLifecycle(tabId, 'syncing', 'conversation-sync-lock');
    const syncStartedAt = this.now();
    const timeoutHandle = this.setTimer(() => {
      this.reportSyncTimeout(tabId, conversation, runtime, syncStartedAt);
    }, this.syncTimeoutMs);
    try {
      await callback({
        tabId,
        conversation,
        runtime,
      });
      return true;
    } finally {
      this.clearTimer(timeoutHandle);
      runtime.isConversationSyncInFlight = false;
      this.host.transitionTabSessionLifecycle(tabId, 'idle', 'conversation-sync-lock-release');
    }
  }

  /**
   * Hydration owns the messages DOM, so syncs arriving mid-hydration are
   * deferred instead of dropped. Concurrent requests for the same tab merge
   * into a single pending retry; the retry re-validates tab/conversation
   * identity before re-entering the sync lock, and gives up after a bounded
   * number of attempts so a stuck hydration cannot spin forever.
   */
  private deferConversationSyncUntilHydrationSettles(
    tabId: TabId,
    request: HydrationDeferredSyncRequest,
  ): boolean {
    if (this.hydrationDeferredSyncByTabId.has(tabId)) {
      // A later canonical/server request carries newer intent (notably a
      // compaction reload), so retain it while sharing the existing timer.
      this.hydrationDeferredSyncByTabId.set(tabId, request);
      return false;
    }

    this.hydrationDeferredSyncByTabId.set(tabId, request);
    this.setTimer(() => {
      const pendingRequest = this.hydrationDeferredSyncByTabId.get(tabId);
      this.hydrationDeferredSyncByTabId.delete(tabId);
      if (pendingRequest) {
        void this.retryHydrationDeferredSync(tabId, pendingRequest);
      }
    }, HYDRATION_SYNC_DEFER_MS);
    return false;
  }

  private async retryHydrationDeferredSync(
    tabId: TabId,
    request: HydrationDeferredSyncRequest,
  ): Promise<void> {
    const { conversation, callback, attempt, requireActiveTab } = request;
    if (requireActiveTab && this.host.getActiveTabId() !== tabId) {
      // A visible-sync deferral whose tab is no longer visible is obsolete.
      return;
    }

    if (this.host.getTab(tabId)?.conversationId !== conversation.id) {
      // The tab moved on to another conversation while hydrating; the new
      // conversation's own sync loop covers it, so this retry is obsolete.
      return;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime?.isHydratingConversation) {
      if (attempt >= HYDRATION_SYNC_DEFER_MAX_ATTEMPTS) {
        logger.warn('Dropping conversation sync after repeated hydration deferrals', {
          tabId,
          conversationId: conversation.id,
          attempts: attempt,
        });
        return;
      }
      this.deferConversationSyncUntilHydrationSettles(
        tabId,
        {
          conversation,
          callback,
          attempt: attempt + 1,
          requireActiveTab,
        },
      );
      return;
    }

    await this.withConversationSyncLock(tabId, conversation, callback);
  }

  private reportSyncTimeout(
    tabId: TabId,
    conversation: Conversation,
    runtime: ConversationSyncRuntime,
    startedAt: number,
  ): void {
    this.onSyncTimeout({
      tabId,
      conversationId: conversation.id,
      openCodeSessionId: conversation.openCodeSessionId ?? undefined,
      backendSessionId: getConversationBackendSessionId(conversation),
      ageMs: this.now() - startedAt,
      phase: runtime.tabSessionLifecycle.phase,
      reason: runtime.tabSessionLifecycle.reason,
      isStreaming: runtime.isStreaming,
    });
  }
}
