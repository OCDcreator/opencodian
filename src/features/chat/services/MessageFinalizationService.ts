import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../core/types';
import { t } from '../../../i18n';
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

interface MessageFinalizationSyncAfterStreamState {
  previousMessagesBeforeSync: ChatMessage[];
  syncResult: MessageFinalizationSyncResult;
  syncSource: 'canonical' | 'server';
  isForegroundConversation: boolean;
  needsForegroundRenderSync: boolean;
}

interface MessageFinalizationSyncAfterStreamFollowUpContext {
  conversation: Conversation;
  tabId: TabId | null;
  editedFiles: string[];
  syncAfterStreamState: MessageFinalizationSyncAfterStreamState;
  logStage: FinalizeMessageOptions['logStage'];
}

export interface AssistantErrorRenderOptions {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
  timestamp: number;
  content: string;
  modelId: string;
}

export interface MessageFinalizationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult | null>;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<MessageFinalizationSyncResult>;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
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
  renderStreamError(options: AssistantErrorRenderOptions): void;
  formatCurrentSessionModelId(): string;
  updateConversationSyncRuntime(tabId: TabId | null, update: { fingerprint?: string | null }): void;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
}

export function getFriendlyServerStartErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = rawMessage.toLowerCase();

  if (lowerMessage.includes('opencode not found')) {
    return t('chat.error.serverBinaryMissing');
  }

  if (lowerMessage.includes('already in use')) {
    return t('chat.error.serverPortInUse');
  }

  return `${t('chat.error.serverStartFailed')}\n${rawMessage}`;
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
        const syncAfterStreamState = await this.requestConversationSyncAfterStream(
          conversation,
          tabId,
          logStage,
        );
        await this.applySyncAfterStreamFollowUp({
          conversation,
          tabId,
          editedFiles,
          syncAfterStreamState,
          logStage,
        });
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

  private async requestConversationSyncAfterStream(
    conversation: Conversation,
    tabId: TabId | null,
    logStage: FinalizeMessageOptions['logStage'],
  ): Promise<MessageFinalizationSyncAfterStreamState> {
    const previousMessagesBeforeSync = [...conversation.messages];
    const previousCanonicalFingerprint = this.host.getConversationSyncFingerprint(
      conversation.messages,
    );
    logStage('server-sync-requested', {
      previousCanonicalFingerprint,
      localTailAssistant: this.host.summarizeChatMessageForDebug(
        this.findLatestAssistantMessage(conversation.messages),
      ),
    });

    const canonicalSyncResult = await this.host.syncConversationMessagesFromCanonicalState(
      conversation,
      tabId,
      'send-finalization',
    );
    if (canonicalSyncResult) {
      logStage('canonical-sync-complete', {
        changed: canonicalSyncResult.changed,
        fingerprint: canonicalSyncResult.fingerprint,
        syncedTailAssistant: this.host.summarizeChatMessageForDebug(
          this.findLatestAssistantMessage(canonicalSyncResult.messages),
        ),
      });

      const isForegroundConversation = this.isForegroundConversation(conversation, tabId);
      return {
        previousMessagesBeforeSync,
        syncResult: canonicalSyncResult,
        syncSource: 'canonical',
        isForegroundConversation,
        needsForegroundRenderSync: isForegroundConversation
          && previousCanonicalFingerprint !== canonicalSyncResult.fingerprint,
      };
    }

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

    const isForegroundConversation = this.isForegroundConversation(conversation, tabId);
    return {
      previousMessagesBeforeSync,
      syncResult,
      syncSource: 'server',
      isForegroundConversation,
      needsForegroundRenderSync: isForegroundConversation
        && previousCanonicalFingerprint !== syncResult.fingerprint,
    };
  }

  private async applySyncAfterStreamFollowUp(
    context: MessageFinalizationSyncAfterStreamFollowUpContext,
  ): Promise<void> {
    const {
      conversation,
      tabId,
      editedFiles,
      syncAfterStreamState,
      logStage,
    } = context;

    if (syncAfterStreamState.isForegroundConversation) {
      this.host.setLastConversationSyncFingerprint(
        tabId,
        syncAfterStreamState.syncResult.fingerprint,
      );
    }

    if (syncAfterStreamState.needsForegroundRenderSync) {
      await this.host.applySyncedConversationUpdate(
        syncAfterStreamState.previousMessagesBeforeSync,
        syncAfterStreamState.syncResult.messages,
      );
      logStage('post-sync-render-apply-complete');
    } else {
      await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
    }

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

  async finalizeAssistantMessageWithError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    errorMessage: string,
  ): Promise<void> {
    const timestamp = Date.now();
    const modelId = this.host.formatCurrentSessionModelId();

    this.host.renderStreamError({
      messageEl,
      contentEl,
      timestamp,
      content: errorMessage,
      modelId,
    });

    const conversation = this.host.getCurrentConversation();
    if (conversation) {
      conversation.messages.push({
        id: `assistant-${timestamp}`,
        role: 'assistant',
        content: errorMessage,
        timestamp,
        modelId,
      });
      conversation.updatedAt = Date.now();
      await this.host.saveConversation(conversation);
      this.host.updateConversationSyncRuntime(
        this.host.getActiveTabId(),
        {
          fingerprint: this.host.getConversationSyncFingerprint(conversation.messages),
        },
      );
    }

    this.host.scrollToBottom({ enableAutoScroll: true });
  }
}
