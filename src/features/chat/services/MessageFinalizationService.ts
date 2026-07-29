import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import type {
  FinalizeMessageOptions,
  MessageFinalizationHost,
  MessageFinalizationSyncResult,
} from './MessageFinalizationHost';
export type {
  AssistantErrorRenderOptions,
  FinalizeMessageOptions,
  MessageFinalizationHost,
  MessageFinalizationHostDependencies,
  MessageFinalizationSyncResult,
  ShouldSyncAfterStreamOptions,
} from './MessageFinalizationHost';
export { createMessageFinalizationHost, shouldSyncAfterStream } from './MessageFinalizationHost';

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

export type UnavailableServerAvailability = 'checking' | 'disabled' | 'starting' | 'offline';

export function getUnavailableServerMessage(availability: UnavailableServerAvailability): string {
  if (availability === 'starting') {
    return t('chat.error.serverStarting');
  }

  if (availability === 'disabled') {
    return t('chat.empty.noBackend.description');
  }

  return t('chat.error.serverOffline');
}

export class MessageFinalizationService {
  constructor(private readonly host: MessageFinalizationHost) {}

  getUnavailableServerPromptMessage(availability: UnavailableServerAvailability): string {
    return getUnavailableServerMessage(availability);
  }

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

      if (conversation.backend === undefined || conversation.backend === 'opencode') {
        const sessionId = getConversationBackendSessionId(conversation);
        await this.host.refreshTabSessionTodos(tabId, sessionId, { suppressErrors: true });
        logStage('session-todos-refreshed');
        await this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
        logStage('session-status-refreshed');
      } else {
        logStage('session-todos-skipped', { backend: conversation.backend });
      }

      if (conversation.backend === 'claude-code') {
        try {
          const messagesBeforeBackfill = conversation.messages.map((m) => ({ ...m }));
          const backfilled = await this.host.backfillClaudeUserMessageIdentities(conversation);
          logStage('claude-user-message-identity-backfill', { backfilled });
          if (backfilled && this.isForegroundConversation(conversation, tabId)) {
            await this.host.applySyncedConversationUpdate(
              messagesBeforeBackfill,
              conversation.messages,
            );
          }
        } catch (err) {
          logStage('claude-user-message-identity-backfill-failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const finalWriteTicket = this.host.createConversationWriteTicket(conversation.id);
      const finalWriteApplied = await this.host.commitConversationWrite(
        conversation,
        finalWriteTicket,
        'finalize-after-stream-updated-at',
        () => {
          conversation.updatedAt = Date.now();
        },
      );
      if (finalWriteApplied) {
        logStage('conversation-final-save-complete', {
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messages.length,
        });
      } else {
        logStage('conversation-final-save-skipped', {
          messageCount: conversation.messages.length,
        });
      }

      this.host.clearPendingEditedFiles(tabId);

      if (this.isForegroundConversation(conversation, tabId)) {
        this.host.setLastConversationSyncFingerprint(
          tabId,
          this.host.getConversationSyncFingerprint(conversation.messages),
        );
        this.host.setTabNeedsAttention(tabId, false);
        this.host.setActiveTabConversation(conversation, tabId);
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
      this.host.transitionTabSessionLifecycle(
        tabId,
        'idle',
        'send-finalization-complete',
      );
      logStage('tab-session-lifecycle-idle');
    }
  }

  private async requestConversationSyncAfterStream(
    conversation: Conversation,
    tabId: TabId | null,
    logStage: FinalizeMessageOptions['logStage'],
  ): Promise<MessageFinalizationSyncAfterStreamState> {
    const previousMessagesBeforeSync = [...conversation.messages];
    const previousCacheFingerprint = this.host.getConversationSyncFingerprint(
      conversation.messages,
    );
    logStage('server-sync-requested', {
      previousCacheFingerprint,
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
          && canonicalSyncResult.changed,
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
        && syncResult.changed,
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
      const writeTicket = this.host.createConversationWriteTicket(conversation.id);
      const writeApplied = await this.host.commitConversationWrite(
        conversation,
        writeTicket,
        'assistant-error-message',
        () => {
          conversation.messages.push({
            id: `assistant-${timestamp}`,
            role: 'assistant',
            content: errorMessage,
            timestamp,
            modelId,
          });
          conversation.updatedAt = Date.now();
        },
      );
      if (writeApplied) {
        this.host.updateConversationSyncRuntime(
          this.host.getActiveTabId(),
          {
            fingerprint: this.host.getConversationSyncFingerprint(conversation.messages),
          },
        );
      }
    }

    this.host.scrollToBottom({ enableAutoScroll: true });
  }

  async finalizeAssistantMessageWithServerError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    error: unknown,
  ): Promise<void> {
    await this.finalizeAssistantMessageWithError(
      messageEl,
      contentEl,
      getFriendlyServerStartErrorMessage(error),
    );
  }

  async finalizeAssistantMessageWithServerUnavailableError(
    messageEl: HTMLElement,
    contentEl: HTMLElement,
    availability: UnavailableServerAvailability,
  ): Promise<void> {
    await this.finalizeAssistantMessageWithError(
      messageEl,
      contentEl,
      getUnavailableServerMessage(availability),
    );
  }
}
