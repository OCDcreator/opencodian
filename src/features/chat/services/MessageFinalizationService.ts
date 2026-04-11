import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../core/types';
import type { TabId } from '../tabs';

export interface ShouldSyncAfterStreamOptions {
  streamCompleted: boolean;
  streamTimedOut: boolean;
  streamInterrupted: boolean;
  latestErrorMessage: string | null;
}

export function shouldSyncAfterStream(options: ShouldSyncAfterStreamOptions): boolean {
  return options.streamCompleted
    && !options.streamTimedOut
    && !options.streamInterrupted
    && !options.latestErrorMessage;
}

export interface MessageFinalizationSyncResult {
  messages: ChatMessage[];
  changed: boolean;
  fingerprint: string;
}

export interface FinalizeMessageOptions {
  conversation: Conversation;
  tabId: TabId | null;
  shouldSyncFromServer: boolean;
  editedFiles: string[];
  logStage(stage: string, payload?: Record<string, unknown>): void;
}

export interface MessageFinalizationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult>;
  getConversationVisualFingerprint(messages: ChatMessage[]): string;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  patchTrailingAssistantRender(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId?: TabId | null,
  ): Promise<boolean>;
  rerenderConversationMessages(conversation: Conversation): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  appendTurnDiffNoticeIfNeeded(
    conversation: Conversation,
    editedFiles: string[],
    tabId?: TabId | null,
  ): Promise<void>;
  refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<SessionTodo[]>;
  saveConversation(conversation: Conversation): Promise<void>;
  setConversationSyncInFlight(tabId: TabId | null, value: boolean): void;
  setLastConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
  clearPendingEditedFiles(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  setActiveTabConversation(conversation: Conversation): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
}

export class MessageFinalizationService {
  constructor(private readonly host: MessageFinalizationHost) {}

  async finalizeAfterStream(options: FinalizeMessageOptions): Promise<void> {
    const {
      conversation,
      tabId,
      shouldSyncFromServer,
      editedFiles,
      logStage,
    } = options;

    try {
      if (shouldSyncFromServer) {
        await this.syncConversationAfterStream(conversation, tabId, editedFiles, logStage);
      }

      await this.host.refreshTabSessionTodos(tabId, conversation.openCodeSessionId, { suppressErrors: true });
      logStage('session-todos-refreshed');

      conversation.updatedAt = Date.now();
      await this.host.saveConversation(conversation);
      logStage('conversation-final-save-complete', {
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
      });

      this.host.clearPendingEditedFiles(tabId);

      if (this.isForegroundConversation(conversation, tabId)) {
        this.host.setLastConversationSyncFingerprint(
          tabId,
          this.host.getConversationSyncFingerprint(conversation.messages),
        );
        this.host.setTabNeedsAttention(tabId, false);
        this.host.setActiveTabConversation(conversation);
        this.host.syncActiveTabContextUsageIdentity();
        await this.host.refreshActiveTabContextUsageFromServer();
        logStage('assistant-message-finalization-complete', {
          tabNeedsAttentionCleared: true,
          latestAssistantMessage: this.host.summarizeChatMessageForDebug(
            this.findLatestAssistantMessage(conversation.messages),
          ),
        });
      } else {
        this.host.setTabNeedsAttention(tabId, true);
        logStage('assistant-message-finalization-complete', {
          tabNeedsAttentionCleared: false,
        });
      }
    } finally {
      if (shouldSyncFromServer) {
        this.host.setConversationSyncInFlight(tabId, false);
        logStage('conversation-sync-lock-cleared');
      }
    }
  }

  private async syncConversationAfterStream(
    conversation: Conversation,
    tabId: TabId | null,
    editedFiles: string[],
    logStage: FinalizeMessageOptions['logStage'],
  ): Promise<void> {
    const previousMessagesBeforeSync = [...conversation.messages];
    const previousVisualFingerprint = this.host.getConversationVisualFingerprint(conversation.messages);
    logStage('server-sync-requested', {
      previousVisualFingerprint,
      localTailAssistant: this.host.summarizeChatMessageForDebug(
        this.findLatestAssistantMessage(conversation.messages),
      ),
    });

    const syncResult = await this.host.syncConversationMessagesFromServer(
      conversation,
      tabId,
      'send-finalization',
    );
    logStage('server-sync-complete', {
      changed: syncResult.changed,
      fingerprint: syncResult.fingerprint,
      syncedTailAssistant: this.host.summarizeChatMessageForDebug(
        this.findLatestAssistantMessage(syncResult.messages),
      ),
    });

    if (this.isForegroundConversation(conversation, tabId)) {
      this.host.setLastConversationSyncFingerprint(tabId, syncResult.fingerprint);
      if (previousVisualFingerprint !== this.host.getConversationVisualFingerprint(syncResult.messages)) {
        const patchedTail = await this.host.patchTrailingAssistantRender(
          previousMessagesBeforeSync,
          syncResult.messages,
          tabId,
        );
        logStage('post-sync-tail-render-attempt', {
          patchedTail,
        });
        if (!patchedTail) {
          await this.host.rerenderConversationMessages(conversation);
          logStage('post-sync-full-rerender-complete');
        }
      }
    }

    await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
    await this.host.appendTurnDiffNoticeIfNeeded(conversation, editedFiles, tabId);
    logStage('turn-diff-processed', {
      pendingEditedFileCount: editedFiles.length,
    });
  }

  private isForegroundConversation(conversation: Conversation, tabId: TabId | null): boolean {
    return this.host.getCurrentConversation()?.id === conversation.id
      && this.host.getActiveTabId() === tabId;
  }

  private findLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
    return [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
  }
}
