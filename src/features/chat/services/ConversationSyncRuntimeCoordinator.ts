import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  TabSessionLifecycleState,
  WritableTabSessionPhase,
} from './TabSessionPhase';

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

export interface VisibleConversationSyncContext {
  tabId: TabId;
  conversation: Conversation;
}

export interface TabConversationSyncContext extends VisibleConversationSyncContext {
  previousFingerprint: string;
}

export class ConversationSyncRuntimeCoordinator {
  constructor(private readonly host: ConversationSyncRuntimeCoordinatorHost) {}

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
    if (!tabId || !conversation?.openCodeSessionId) {
      return false;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.isStreaming || runtime.isConversationSyncInFlight) {
      return false;
    }

    runtime.isConversationSyncInFlight = true;
    this.host.transitionTabSessionLifecycle(tabId, 'syncing', 'conversation-sync-lock');
    try {
      await callback({
        tabId,
        conversation,
        runtime,
      });
      return true;
    } finally {
      runtime.isConversationSyncInFlight = false;
      this.host.transitionTabSessionLifecycle(tabId, 'idle', 'conversation-sync-lock-release');
    }
  }
}
