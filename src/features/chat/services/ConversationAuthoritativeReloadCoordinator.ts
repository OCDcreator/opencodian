/* eslint-disable max-lines -- Authoritative reload owner keeps reload, merge, render, and recovery orchestration together. */
import type {
  OpenCodeCanonicalSessionState,
} from '../../../core/opencode';
import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import {
  shouldBypassCanonicalSyncForInterruptedNotice,
  shouldPreserveInterruptedNoticeOnSync,
} from './conversationAuthoritativeReloadLocalFallback';
import type {
  ConversationAuthoritativeSyncHost,
  ConversationAuthoritativeSyncResult,
  ConversationAuthoritativeSyncRevertState,
  ConversationAuthoritativeSyncRuntime,
} from './ConversationAuthoritativeSyncCoordinator';
import { ConversationTurnViewModelBuilder } from './ConversationTurnViewModelBuilder';

const logger = createLogger('OpenCodianView');

type ConversationServerMessages = Awaited<
  ReturnType<ConversationAuthoritativeSyncHost['getSessionMessages']>
>;

interface ConversationServerSyncSnapshot {
  serverMessages: ConversationServerMessages;
  convertedServerMessages: ChatMessage[];
  revertState: ConversationAuthoritativeSyncRevertState | null;
}

interface ConversationServerSyncMergeResult {
  merged: ChatMessage[];
  preservedClientOnlyMessages: ChatMessage[];
  fingerprint: string;
  changed: boolean;
  cacheWritebackChanged: boolean;
}

interface ConversationServerSyncContext {
  conversation: Conversation;
  tabId: TabId | null;
  reason: string;
  verbose: boolean;
}

type ConversationAuthoritativeReloadHost = Pick<
  ConversationAuthoritativeSyncHost,
  | 'getConversationSyncFingerprint'
  | 'getCanonicalSessionMessages'
  | 'getCurrentConversationId'
  | 'getCurrentConversationRevertState'
  | 'getInterruptedSyncPreservationLogFingerprint'
  | 'getSessionMessages'
  | 'getSessionRevertState'
  | 'getTabRuntimeState'
  | 'getVaultBasePath'
  | 'hydrateOpenCodeMessage'
  | 'logAssistantFinalizationDebug'
  | 'logOmoBackgroundTaskDiagnostics'
  | 'markBackgroundTaskAuthoritativeSync'
  | 'refreshContextUsageAfterActiveConversationSync'
  | 'createConversationWriteTicket'
  | 'commitConversationWrite'
  | 'shouldRenderConversationMessage'
  | 'stringifyLogPayload'
  | 'summarizeChatMessageForDebug'
  | 'getLogPreview'
>;

export interface ConversationAuthoritativeReloadCoordinatorDependencies {
  host: ConversationAuthoritativeReloadHost;
  mergeSyncedConversationMessages(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
    verbose: boolean,
  ): ChatMessage[];
}

export class ConversationAuthoritativeReloadCoordinator {
  private readonly host: ConversationAuthoritativeReloadHost;
  private readonly mergeSyncedConversationMessages:
    ConversationAuthoritativeReloadCoordinatorDependencies['mergeSyncedConversationMessages'];
  private readonly turnViewModelBuilder = new ConversationTurnViewModelBuilder();

  constructor({
    host,
    mergeSyncedConversationMessages,
  }: ConversationAuthoritativeReloadCoordinatorDependencies) {
    this.host = host;
    this.mergeSyncedConversationMessages = mergeSyncedConversationMessages;
  }

  async syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason = 'unspecified',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationAuthoritativeSyncResult> {
    const verbose = !options?.suppressVerboseLogs;
    try {
      const ticket = this.host.createConversationWriteTicket(conversation.id);
      const syncContext = { conversation, tabId, reason, verbose };
      this.logConversationServerSyncBegin(syncContext);
      const snapshot = await this.getConversationServerSyncSnapshot(conversation);
      this.logConversationServerSyncFetched(syncContext, snapshot);
      this.host.logOmoBackgroundTaskDiagnostics(
        conversation,
        conversation.messages,
        snapshot.convertedServerMessages,
      );
      const syncMerge = this.getConversationServerSyncMerge(syncContext, snapshot);

      const writeApplied = await this.applyConversationServerSyncMessages(conversation, ticket, syncMerge, 'authoritative-server-sync');
      if (!writeApplied) {
        return this.buildSkippedConversationServerSyncResult(conversation);
      }

      this.host.markBackgroundTaskAuthoritativeSync(tabId, reason);

      await this.host.refreshContextUsageAfterActiveConversationSync(conversation, tabId);
      this.logConversationServerSyncComplete(conversation, reason, snapshot, syncMerge);
      this.logConversationServerSyncFinished(syncContext, snapshot, syncMerge);
      return {
        messages: syncMerge.merged,
        changed: syncMerge.changed,
        fingerprint: syncMerge.fingerprint,
        revertState: snapshot.revertState,
      };
    } catch (error) {
      logger.error('Failed to sync conversation messages from server:', error);
      const fingerprint = this.host.getConversationSyncFingerprint(conversation.messages);
      this.host.logAssistantFinalizationDebug('server-sync-failed', {
        reason,
        conversationId: conversation.id,
        sessionId: conversation.openCodeSessionId,
        tabId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return {
        messages: conversation.messages,
        changed: false,
        fingerprint,
        revertState: this.host.getCurrentConversationId() === conversation.id
          ? this.host.getCurrentConversationRevertState()
          : null,
      };
    }
  }

  async syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason = 'sync-event',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationAuthoritativeSyncResult | null> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      return null;
    }

    const canonicalMessages = this.host.getCanonicalSessionMessages(sessionId);
    if (!canonicalMessages) {
      return null;
    }

    if (shouldBypassCanonicalSyncForInterruptedNotice(conversation.messages, canonicalMessages)) {
      return null;
    }

    const verbose = !options?.suppressVerboseLogs;
    const ticket = this.host.createConversationWriteTicket(conversation.id);
    const syncContext = { conversation, tabId, reason, verbose };
    const snapshot: ConversationServerSyncSnapshot = {
      serverMessages: canonicalMessages,
      convertedServerMessages: this.projectCanonicalRenderMessages(
        sessionId,
        canonicalMessages,
      ),
      revertState: this.getConversationCanonicalSyncRevertState(conversation, canonicalMessages),
    };

    this.host.logOmoBackgroundTaskDiagnostics(
      conversation,
      conversation.messages,
      snapshot.convertedServerMessages,
    );
    const syncMerge = this.getConversationServerSyncMerge(syncContext, snapshot);
    const writeApplied = await this.applyConversationServerSyncMessages(conversation, ticket, syncMerge, 'authoritative-canonical-sync');
    if (!writeApplied) {
      return this.buildSkippedConversationServerSyncResult(conversation);
    }

    this.host.markBackgroundTaskAuthoritativeSync(tabId, reason);
    await this.host.refreshContextUsageAfterActiveConversationSync(conversation, tabId);
    this.logConversationServerSyncComplete(conversation, reason, snapshot, syncMerge);
    this.logConversationServerSyncFinished(syncContext, snapshot, syncMerge);

    return {
      messages: syncMerge.merged,
      changed: syncMerge.changed,
      fingerprint: syncMerge.fingerprint,
      revertState: snapshot.revertState,
    };
  }

  private logConversationServerSyncBegin(context: ConversationServerSyncContext): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.host.logAssistantFinalizationDebug('server-sync-begin', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      existingMessageCount: conversation.messages.length,
      localTailAssistant: this.host.summarizeChatMessageForDebug(
        [...conversation.messages].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private async getConversationServerSyncSnapshot(
    conversation: Conversation,
  ): Promise<ConversationServerSyncSnapshot> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      return {
        serverMessages: [],
        convertedServerMessages: [],
        revertState: null,
      };
    }

    const serverMessages = await this.host.getSessionMessages(sessionId);
    const revertState = await this.getConversationServerSyncRevertState(
      conversation,
      serverMessages,
    );
    const convertedServerMessages = this.projectCanonicalRenderMessages(
      sessionId,
      serverMessages,
    );

    return { serverMessages, convertedServerMessages, revertState };
  }

  private projectCanonicalRenderMessages(
    sessionId: string,
    messages: ConversationServerMessages,
  ): ChatMessage[] {
    const renderInput = this.turnViewModelBuilder.buildCanonicalRenderInput(
      this.buildCanonicalSessionState(sessionId, messages),
      (info, parts) => this.host.hydrateOpenCodeMessage(info, parts, this.host.getVaultBasePath()),
    );

    return renderInput.messages.filter((message) => this.host.shouldRenderConversationMessage(message));
  }

  private buildCanonicalSessionState(
    sessionId: string,
    messages: ConversationServerMessages,
  ): OpenCodeCanonicalSessionState {
    return {
      sessionID: sessionId,
      messages: messages.map(({ info }) => info),
      partsByMessageID: this.buildPartsByMessageId(messages),
    };
  }

  private buildPartsByMessageId(
    messages: ConversationServerMessages,
  ): OpenCodeCanonicalSessionState['partsByMessageID'] {
    return messages.reduce<OpenCodeCanonicalSessionState['partsByMessageID']>((partsByMessageID, message) => {
      partsByMessageID[message.info.id] = message.parts;
      return partsByMessageID;
    }, {});
  }

  private async getConversationServerSyncRevertState(
    conversation: Conversation,
    serverMessages: ConversationServerMessages,
  ): Promise<ConversationAuthoritativeSyncRevertState | null> {
    if (serverMessages.length > 0) {
      return null;
    }

    const sessionId = getConversationBackendSessionId(conversation);
    return sessionId ? this.host.getSessionRevertState(sessionId) : null;
  }

  private getConversationCanonicalSyncRevertState(
    conversation: Conversation,
    canonicalMessages: ConversationServerMessages,
  ): ConversationAuthoritativeSyncRevertState | null {
    if (canonicalMessages.length > 0 || this.host.getCurrentConversationId() !== conversation.id) {
      return null;
    }

    return this.host.getCurrentConversationRevertState();
  }

  private logConversationServerSyncFetched(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
  ): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.host.logAssistantFinalizationDebug('server-sync-fetched', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      serverMessageCount: snapshot.serverMessages.length,
      convertedMessageCount: snapshot.convertedServerMessages.length,
      serverTailAssistant: this.host.summarizeChatMessageForDebug(
        [...snapshot.convertedServerMessages].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private getConversationServerSyncMerge(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
  ): ConversationServerSyncMergeResult {
    const { conversation, tabId, verbose } = context;
    const converted = this.mergeSyncedConversationMessages(
      conversation.messages,
      snapshot.convertedServerMessages,
      verbose,
    );
    const preservedClientOnlyMessages = this.getClientOnlyMessagesToPreserveOnSync(
      conversation.messages,
      converted,
    );
    this.logPreservedInterruptedMessagesDuringSync(
      conversation,
      tabId,
      preservedClientOnlyMessages,
    );

    const merged = [...converted, ...preservedClientOnlyMessages]
      .sort((left, right) => left.timestamp - right.timestamp);
    this.logConversationServerSyncMerged(context, merged, preservedClientOnlyMessages);

    const fingerprint = this.host.getConversationSyncFingerprint(merged);
    const previousCacheFingerprint = this.host.getConversationSyncFingerprint(conversation.messages);
    const previousFingerprint = this.host.getTabRuntimeState(tabId)?.lastConversationSyncFingerprint
      ?? previousCacheFingerprint;

    return {
      merged,
      preservedClientOnlyMessages,
      fingerprint,
      changed: fingerprint !== previousFingerprint,
      cacheWritebackChanged: fingerprint !== previousCacheFingerprint,
    };
  }

  private getClientOnlyMessagesToPreserveOnSync(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
  ): ChatMessage[] {
    if (syncedMessages.length === 0 && this.hasUnanchoredLocalStreamErrorNotice(existingMessages)) {
      return existingMessages;
    }

    return existingMessages.filter((message) => {
      if (shouldPreserveInterruptedNoticeOnSync(existingMessages, syncedMessages, message)) {
        return true;
      }

      if (message.displayStyle === 'notice' && message.sourceMessageId) {
        const matchedMessage = syncedMessages.find(
          (candidate) => candidate.sourceMessageId === message.sourceMessageId,
        );
        return !matchedMessage || !this.host.shouldRenderConversationMessage(matchedMessage);
      }

      if (
        message.role !== 'assistant'
        || message.streamState !== 'interrupted'
      ) {
        return false;
      }

      if (syncedMessages.length > 0) {
        return false;
      }

      const hasVisibleContent = Boolean(
        message.content?.trim()
        || (message.contentBlocks?.length ?? 0) > 0,
      );
      if (!hasVisibleContent) {
        return false;
      }

      if (message.sourceMessageId) {
        return !syncedMessages.some(
          (candidate) => candidate.sourceMessageId === message.sourceMessageId,
        );
      }

      return true;
    });
  }

  private hasUnanchoredLocalStreamErrorNotice(messages: ChatMessage[]): boolean {
    return messages.some((message) =>
      message.role === 'assistant'
      && message.displayStyle === 'notice'
      && message.noticeTone === 'error'
      && !message.sourceMessageId
      && message.id.startsWith('assistant-error-notice-'));
  }

  private logPreservedInterruptedMessagesDuringSync(
    conversation: Conversation,
    tabId: TabId | null,
    preservedClientOnlyMessages: ChatMessage[],
  ): void {
    const preservedInterruptedMessages = preservedClientOnlyMessages.filter(
      (message) => message.streamState === 'interrupted',
    );
    const runtime = this.host.getTabRuntimeState(tabId);
    const preservedInterruptedLogFingerprint = preservedInterruptedMessages.length > 0
      ? this.host.getInterruptedSyncPreservationLogFingerprint(
          conversation,
          preservedInterruptedMessages,
        )
      : null;

    this.logPreservedInterruptedMessagesIfNeeded(
      conversation,
      preservedInterruptedMessages,
      runtime,
      preservedInterruptedLogFingerprint,
    );
    if (runtime) {
      runtime.lastInterruptedSyncPreservationLogFingerprint =
        preservedInterruptedLogFingerprint;
    }
  }

  private logPreservedInterruptedMessagesIfNeeded(
    conversation: Conversation,
    preservedInterruptedMessages: ChatMessage[],
    runtime: ConversationAuthoritativeSyncRuntime | null,
    preservedInterruptedLogFingerprint: string | null,
  ): void {
    if (preservedInterruptedMessages.length === 0) {
      return;
    }

    if (runtime?.lastInterruptedSyncPreservationLogFingerprint === preservedInterruptedLogFingerprint) {
      return;
    }

    logger.debug(`Preserving local interrupted assistant message(s) during conversation sync: ${this.host.stringifyLogPayload({
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      count: preservedInterruptedMessages.length,
      messages: preservedInterruptedMessages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        contentPreview: this.host.getLogPreview(message.content, 120),
        contentBlockCount: message.contentBlocks?.length ?? 0,
      })),
    })}`);
  }

  private logConversationServerSyncMerged(
    context: ConversationServerSyncContext,
    merged: ChatMessage[],
    preservedClientOnlyMessages: ChatMessage[],
  ): void {
    if (!context.verbose) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.host.logAssistantFinalizationDebug('server-sync-merged', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      mergedMessageCount: merged.length,
      preservedClientOnlyMessageCount: preservedClientOnlyMessages.length,
      mergedTailAssistant: this.host.summarizeChatMessageForDebug(
        [...merged].reverse().find((message) => message.role === 'assistant'),
      ),
    });
  }

  private async applyConversationServerSyncMessages(
    conversation: Conversation,
    ticket: ReturnType<ConversationAuthoritativeReloadHost['createConversationWriteTicket']>,
    syncMerge: ConversationServerSyncMergeResult,
    reason: string,
  ): Promise<boolean> {
    return this.host.commitConversationWrite(conversation, ticket, reason, () => {
      conversation.messages = syncMerge.merged;
      if (syncMerge.cacheWritebackChanged) {
        conversation.updatedAt = Date.now();
      }
    });
  }

  private buildSkippedConversationServerSyncResult(conversation: Conversation): ConversationAuthoritativeSyncResult {
    const isCurrentConversation = this.host.getCurrentConversationId() === conversation.id;
    return {
      messages: conversation.messages,
      changed: false,
      fingerprint: this.host.getConversationSyncFingerprint(conversation.messages),
      revertState: isCurrentConversation ? this.host.getCurrentConversationRevertState() : null,
    };
  }

  private logConversationServerSyncComplete(
    conversation: Conversation,
    reason: string,
    snapshot: ConversationServerSyncSnapshot,
    syncMerge: ConversationServerSyncMergeResult,
  ): void {
    if (!syncMerge.changed) {
      return;
    }

    logger.debug('Conversation sync complete', {
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      reason,
      serverMessageCount: snapshot.serverMessages.length,
      mergedMessageCount: syncMerge.merged.length,
      preservedClientOnlyMessageCount: syncMerge.preservedClientOnlyMessages.length,
      revertApplied: Boolean(snapshot.revertState),
      revertMessageId: snapshot.revertState?.messageID ?? null,
      changed: syncMerge.changed,
      cacheWritebackChanged: syncMerge.cacheWritebackChanged,
    });
  }

  private logConversationServerSyncFinished(
    context: ConversationServerSyncContext,
    snapshot: ConversationServerSyncSnapshot,
    syncMerge: ConversationServerSyncMergeResult,
  ): void {
    if (!context.verbose && !syncMerge.changed) {
      return;
    }

    const { conversation, tabId, reason } = context;
    this.host.logAssistantFinalizationDebug('server-sync-finished', {
      reason,
      conversationId: conversation.id,
      sessionId: conversation.openCodeSessionId,
      tabId,
      changed: syncMerge.changed,
      cacheWritebackChanged: syncMerge.cacheWritebackChanged,
      fingerprint: syncMerge.fingerprint,
      revertApplied: Boolean(snapshot.revertState),
      revertMessageId: snapshot.revertState?.messageID ?? null,
    });
  }
}
