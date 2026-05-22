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

export interface ConversationSyncRuntime {
  isStreaming: boolean;
  isConversationSyncInFlight: boolean;
  lastConversationSyncFingerprint: string | null;
  tabSessionLifecycle: TabSessionLifecycleState;
}

export interface ConversationSyncRuntimeCoordinatorHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
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

export class ConversationSyncRuntimeCoordinator {
  private readonly syncTimeoutMs: number;
  private readonly onSyncTimeout: (diagnostic: ConversationSyncTimeoutDiagnostic) => void;
  private readonly now: () => number;
  private readonly setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ConversationSyncTimerHandle;
  private readonly clearTimer: (handle: ConversationSyncTimerHandle) => void;

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
