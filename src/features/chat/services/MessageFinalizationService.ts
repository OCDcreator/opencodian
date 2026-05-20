import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { t } from '../../../i18n';
import { summarizeChatMessageForDebug } from '../runtime/SendPipelineDebugSummaries';
import type { TabId } from '../tabs';
import type { ConversationWriteTicket } from './ConversationWriteSerializationService';

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
  modelId?: string;
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
  createConversationWriteTicket(conversationId: string): ConversationWriteTicket;
  commitConversationWrite(
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ): Promise<boolean>;
  setConversationSyncInFlight(tabId: TabId | null, value: boolean): void;
  setLastConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
  clearPendingEditedFiles(tabId: TabId | null): void;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  setActiveTabConversation(conversation: Conversation): void;
  syncActiveTabContextUsageIdentity(): void;
  refreshActiveTabContextUsageFromServer(): Promise<void>;
  summarizeChatMessageForDebug(message: ChatMessage | null | undefined): Record<string, unknown> | null;
  renderStreamError(options: AssistantErrorRenderOptions): void;
  formatCurrentSessionModelId(): string | undefined;
  updateConversationSyncRuntime(tabId: TabId | null, update: { fingerprint?: string | null }): void;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
}

export interface MessageFinalizationHostDependencies {
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
  conversationIdentityRuntime: {
    getConversationSyncFingerprint(messages: ChatMessage[]): string;
  };
  conversationRenderService: {
    applySyncedConversationUpdate(
      previousMessages: ChatMessage[],
      nextMessages: ChatMessage[],
    ): Promise<void>;
  };
  backgroundTaskHost: {
    renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  };
  conversationNoticeCoordinator: {
    appendTurnDiffNoticeIfNeeded(
      conversation: Conversation,
      editedFiles: string[],
      tabId?: TabId | null,
    ): Promise<void>;
  };
  sessionTodoCoordinator: {
    refreshTabSessionTodos(
      tabId: TabId | null,
      sessionId: string | undefined,
      options: { suppressErrors?: boolean },
    ): Promise<SessionTodo[]>;
  };
  createConversationWriteTicket: (conversationId: string) => ConversationWriteTicket;
  commitConversationWrite: (
    conversation: Conversation,
    ticket: ConversationWriteTicket,
    reason: string,
    write: () => void | Promise<void>,
  ) => Promise<boolean>;
  conversationTabRuntimeCoordinator: {
    updateConversationSyncRuntime(
      tabId: TabId | null,
      update: { inFlight?: boolean; fingerprint?: string | null },
    ): void;
    clearPendingEditedFiles(tabId: TabId | null): void;
  };
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  tabConversationStateBridge: {
    syncActiveTabConversation(conversation: Conversation): void;
  };
  activeTabContextUsageCoordinator: {
    syncIdentity(): void;
    refreshFromServer(): Promise<void>;
  };
  assistantShellViewHostAdapter: {
    renderStreamError(options: AssistantErrorRenderOptions): void;
  };
  formatCurrentSessionModelId(): string | undefined;
  scrollToBottom(options: { enableAutoScroll: boolean }): void;
}

export function createMessageFinalizationHost(
  deps: MessageFinalizationHostDependencies,
): MessageFinalizationHost {
  const tabRuntime = deps.conversationTabRuntimeCoordinator;
  const ctxUsage = deps.activeTabContextUsageCoordinator;
  return {
    getCurrentConversation: () => deps.getCurrentConversation(),
    getActiveTabId: () => deps.getActiveTabId(),
    syncConversationMessagesFromCanonicalState: (conversation, tabId, reason) =>
      deps.syncConversationMessagesFromCanonicalState(conversation, tabId, reason),
    syncConversationMessagesFromServer: (conversation, tabId, reason) =>
      deps.syncConversationMessagesFromServer(conversation, tabId, reason),
    getConversationSyncFingerprint: (messages) =>
      deps.conversationIdentityRuntime.getConversationSyncFingerprint(messages),
    applySyncedConversationUpdate: (previousMessages, nextMessages) =>
      deps.conversationRenderService.applySyncedConversationUpdate(previousMessages, nextMessages),
    renderBackgroundTaskIndicatorIfNeeded: (tabId) =>
      deps.backgroundTaskHost.renderBackgroundTaskIndicatorIfNeeded(tabId),
    appendTurnDiffNoticeIfNeeded: (conversation, editedFiles, tabId) =>
      deps.conversationNoticeCoordinator.appendTurnDiffNoticeIfNeeded(conversation, editedFiles, tabId),
    refreshTabSessionTodos: (tabId, sessionId, options) =>
      deps.sessionTodoCoordinator.refreshTabSessionTodos(tabId, sessionId, options),
    createConversationWriteTicket: (conversationId) =>
      deps.createConversationWriteTicket(conversationId),
    commitConversationWrite: (conversation, ticket, reason, write) =>
      deps.commitConversationWrite(conversation, ticket, reason, write),
    setConversationSyncInFlight: (tabId, value) => {
      tabRuntime.updateConversationSyncRuntime(tabId, { inFlight: value });
    },
    setLastConversationSyncFingerprint: (tabId, fingerprint) => {
      tabRuntime.updateConversationSyncRuntime(tabId, { fingerprint });
    },
    clearPendingEditedFiles: (tabId) => tabRuntime.clearPendingEditedFiles(tabId),
    setTabNeedsAttention: (tabId, needsAttention) =>
      deps.setTabNeedsAttention(tabId, needsAttention),
    setActiveTabConversation: (conversation) =>
      deps.tabConversationStateBridge.syncActiveTabConversation(conversation),
    syncActiveTabContextUsageIdentity: () => ctxUsage.syncIdentity(),
    refreshActiveTabContextUsageFromServer: () => ctxUsage.refreshFromServer(),
    summarizeChatMessageForDebug: (message) => summarizeChatMessageForDebug(message),
    renderStreamError: (options) =>
      deps.assistantShellViewHostAdapter.renderStreamError(options),
    formatCurrentSessionModelId: () => deps.formatCurrentSessionModelId(),
    updateConversationSyncRuntime: (tabId, update) =>
      tabRuntime.updateConversationSyncRuntime(tabId, update),
    scrollToBottom: (options) => deps.scrollToBottom(options),
  };
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
        await this.host.refreshTabSessionTodos(tabId, getConversationBackendSessionId(conversation), { suppressErrors: true });
        logStage('session-todos-refreshed');
      } else {
        logStage('session-todos-skipped', { backend: conversation.backend });
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
