import type { OpenCodeService } from '../../../core/opencode';
import type {
  ChatMessage,
  ContentBlock,
  Conversation,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('OpenCodianView');

type OpenCodeSessionMessages = Awaited<ReturnType<OpenCodeService['getSessionMessages']>>;
type OpenCodeSessionMessage = OpenCodeSessionMessages[number];

interface LatestServerUserMessageHydration {
  hydratedMessage: ChatMessage;
  rawServerUserText: string;
}

interface ConversationServerSyncSnapshot {
  serverMessages: OpenCodeSessionMessages;
  convertedServerMessages: ChatMessage[];
  revertState: ConversationAuthoritativeSyncRevertState | null;
}

interface ConversationServerSyncMergeResult {
  merged: ChatMessage[];
  preservedClientOnlyMessages: ChatMessage[];
  fingerprint: string;
  changed: boolean;
}

interface HydratedUserMessageMismatchContext {
  sessionId: string;
  optimisticMessageId: string;
  rawServerUserText: string;
}

interface HydratedOptimisticUserMessageUpdate {
  conversation: Conversation;
  optimisticIndex: number;
  optimisticMessage: ChatMessage;
  mergedHydratedMessage: ChatMessage;
  tabId: TabId | null;
}

interface ConversationServerSyncContext {
  conversation: Conversation;
  tabId: TabId | null;
  reason: string;
  verbose: boolean;
}

export interface ConversationAuthoritativeSyncRuntime {
  lastConversationSyncFingerprint: string | null;
  lastInterruptedSyncPreservationLogFingerprint: string | null;
}

export interface ConversationAuthoritativeSyncRevertState {
  messageID: string;
  partID?: string;
}

export interface ConversationAuthoritativeSyncResult {
  messages: ChatMessage[];
  changed: boolean;
  fingerprint: string;
  revertState: ConversationAuthoritativeSyncRevertState | null;
}

export interface ConversationAuthoritativeSyncHost {
  getVaultBasePath(): string | undefined;
  getTabRuntimeState(tabId: TabId | null): ConversationAuthoritativeSyncRuntime | null;
  getCurrentConversationId(): string | null;
  getCurrentConversationRevertState(): ConversationAuthoritativeSyncRevertState | null;
  getActiveTabId(): TabId | null;
  getSessionMessages(sessionId: string): Promise<OpenCodeSessionMessages>;
  getSessionRevertState(
    sessionId: string,
  ): Promise<ConversationAuthoritativeSyncRevertState | null>;
  hydrateOpenCodeMessage(
    info: OpenCodeSessionMessage['info'],
    parts: OpenCodeSessionMessage['parts'],
    vaultBasePath: string | undefined,
  ): ChatMessage;
  shouldRenderConversationMessage(message: ChatMessage): boolean;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  getInterruptedSyncPreservationLogFingerprint(
    conversation: Conversation,
    messages: ChatMessage[],
  ): string;
  saveConversation(conversation: Conversation): Promise<void>;
  logOmoBackgroundTaskDiagnostics(
    conversation: Conversation,
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): void;
  markBackgroundTaskAuthoritativeSync(tabId: TabId | null, reason: string): void;
  refreshContextUsageAfterActiveConversationSync(
    conversation: Conversation,
    tabId: TabId | null,
  ): Promise<void>;
  armBackgroundTaskIndicatorForUserMessage(message: ChatMessage, tabId: TabId | null): void;
  updateHydratedUserMessageRuntimeAnchors(
    conversation: Conversation,
    optimisticMessage: ChatMessage,
    mergedHydratedMessage: ChatMessage,
    tabId: TabId | null,
  ): void;
  rerenderSingleUserMessage(previousMessageId: string, message: ChatMessage): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
  summarizeChatMessageForDebug(
    message: ChatMessage | null | undefined,
  ): Record<string, unknown> | null;
  logAssistantFinalizationDebug(label: string, payload: unknown): void;
  stringifyLogPayload(payload: unknown): string;
  getLogPreview(text: string, maxLength?: number): string;
}

export class ConversationAuthoritativeSyncCoordinator {
  constructor(private readonly host: ConversationAuthoritativeSyncHost) {}

  mergeClientOnlyMessageFields(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    verbose = true,
  ): ChatMessage {
    const contextAttachments = this.mergeSyncedMessageContextAttachments(existingMessage, syncedMessage);
    const content = this.mergeSyncedMessageContent(existingMessage, syncedMessage);
    const contentBlocks = this.mergeSyncedMessageContentBlocks(existingMessage, syncedMessage);
    const toolCalls = this.mergeSyncedMessageToolCalls(existingMessage, syncedMessage);
    const preservedFlags = this.getClientOnlyMessagePreservationFlags(
      existingMessage,
      syncedMessage,
      { content, contentBlocks, toolCalls },
    );
    this.logClientOnlyMessageFieldPreservation(
      existingMessage,
      syncedMessage,
      preservedFlags,
      verbose,
    );

    return {
      ...syncedMessage,
      content,
      contentBlocks,
      toolCalls,
      contextAttachments,
      questionResolution: syncedMessage.questionResolution ?? existingMessage.questionResolution,
      streamState: syncedMessage.streamState ?? existingMessage.streamState,
      structured: syncedMessage.structured ?? existingMessage.structured,
      parts: syncedMessage.parts ?? existingMessage.parts,
    };
  }

  async syncLatestUserMessageFromServer(
    conversation: Conversation,
    optimisticMessageId: string,
    tabId: TabId | null,
  ): Promise<void> {
    const sessionId = conversation.openCodeSessionId;
    if (!sessionId) {
      return;
    }

    try {
      const hydration = await this.getLatestServerUserMessageHydration(sessionId);
      if (!hydration) {
        return;
      }

      this.logLatestServerUserMessageHydration(sessionId, optimisticMessageId, hydration);
      const optimisticIndex = conversation.messages.findIndex(
        (message) => message.id === optimisticMessageId,
      );
      if (optimisticIndex < 0) {
        return;
      }

      const optimisticMessage = conversation.messages[optimisticIndex];
      const hydratedMessage = hydration.hydratedMessage;
      if (this.hasVisibleTextMismatchForHydratedUserMessage(
        optimisticMessage,
        hydratedMessage,
        {
          sessionId,
          optimisticMessageId,
          rawServerUserText: hydration.rawServerUserText,
        },
      )) {
        return;
      }

      const mergedHydratedMessage = this.mergeClientOnlyMessageFields(
        optimisticMessage,
        hydratedMessage,
      );
      if (!this.hasHydratedOptimisticUserMessageChanged(
        optimisticMessage,
        mergedHydratedMessage,
      )) {
        this.logSkippedUnchangedHydratedUserMessage(
          sessionId,
          optimisticMessageId,
          hydratedMessage,
        );
        return;
      }

      await this.applyHydratedOptimisticUserMessage({
        conversation,
        optimisticIndex,
        optimisticMessage,
        mergedHydratedMessage,
        tabId,
      });
      logger.debug(`Applied hydrated server user message to optimistic bubble: ${this.host.stringifyLogPayload({
        sessionId,
        optimisticMessageId,
        sourceMessageId: mergedHydratedMessage.sourceMessageId ?? null,
        omoDetected: Boolean(mergedHydratedMessage.omo),
        omoKind: mergedHydratedMessage.omo?.kind ?? null,
      })}`);
    } catch (error) {
      logger.debug('Failed to hydrate optimistic user message from server', error);
    }
  }

  async syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason = 'unspecified',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationAuthoritativeSyncResult> {
    const verbose = !options?.suppressVerboseLogs;
    try {
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

      await this.applyConversationServerSyncMessages(
        conversation,
        syncMerge.merged,
        syncMerge.changed,
      );

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

  private mergeSyncedMessageModelIds(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
    verbose = true,
  ): ChatMessage[] {
    const modelIdBySourceMessageId = new Map<string, string>();
    const messageBySourceMessageId = new Map<string, ChatMessage>();
    const fallbackAssistantMessages = existingMessages.filter(
      (message) => message.role === 'assistant' && message.modelId && !message.sourceMessageId,
    );

    for (const message of existingMessages) {
      if (message.role !== 'assistant' || !message.modelId || !message.sourceMessageId) {
        if (message.sourceMessageId) {
          messageBySourceMessageId.set(message.sourceMessageId, message);
        }
        continue;
      }

      modelIdBySourceMessageId.set(message.sourceMessageId, message.modelId);
      messageBySourceMessageId.set(message.sourceMessageId, message);
    }

    const mergedMessages = syncedMessages.map((message) => {
      const existingMessage = message.sourceMessageId
        ? messageBySourceMessageId.get(message.sourceMessageId)
        : undefined;
      const mergedMessage = existingMessage
        ? this.mergeClientOnlyMessageFields(existingMessage, message, verbose)
        : message;

      if (mergedMessage.role !== 'assistant') {
        return mergedMessage;
      }

      const persistedModelId = mergedMessage.sourceMessageId
        ? modelIdBySourceMessageId.get(mergedMessage.sourceMessageId)
        : undefined;

      return persistedModelId
        ? { ...mergedMessage, modelId: persistedModelId }
        : mergedMessage;
    });

    const unmatchedSyncedIndexes = mergedMessages.reduce<number[]>((indexes, message, index) => {
      if (message.role === 'assistant' && !message.modelId) {
        indexes.push(index);
      }

      return indexes;
    }, []);

    for (
      let fallbackIndex = fallbackAssistantMessages.length - 1;
      fallbackIndex >= 0;
      fallbackIndex--
    ) {
      if (unmatchedSyncedIndexes.length === 0) {
        break;
      }

      const fallbackMessage = fallbackAssistantMessages[fallbackIndex];
      let preferredMatchPosition = -1;
      if (fallbackMessage.content) {
        for (
          let indexPosition = unmatchedSyncedIndexes.length - 1;
          indexPosition >= 0;
          indexPosition--
        ) {
          const unmatchedIndex = unmatchedSyncedIndexes[indexPosition];
          if (mergedMessages[unmatchedIndex].content === fallbackMessage.content) {
            preferredMatchPosition = indexPosition;
            break;
          }
        }
      }
      const targetPosition = preferredMatchPosition >= 0
        ? preferredMatchPosition
        : unmatchedSyncedIndexes.length - 1;
      const targetIndex = unmatchedSyncedIndexes.splice(targetPosition, 1)[0];

      mergedMessages[targetIndex] = {
        ...mergedMessages[targetIndex],
        modelId: fallbackMessage.modelId,
      };
    }

    return mergedMessages;
  }

  private mergeSyncedMessageContextAttachments(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['contextAttachments'] {
    const existingAttachments = existingMessage.contextAttachments;
    const syncedAttachments = syncedMessage.contextAttachments;
    if (!existingAttachments?.length) {
      return syncedAttachments;
    }

    if (!syncedAttachments?.length) {
      return existingAttachments;
    }

    return syncedAttachments.map((attachment) =>
      existingAttachments.find((candidate) =>
        this.isMatchingMessageContextAttachment(candidate, attachment))
      ?? attachment,
    );
  }

  private isMatchingMessageContextAttachment(
    left: NonNullable<ChatMessage['contextAttachments']>[number],
    right: NonNullable<ChatMessage['contextAttachments']>[number],
  ): boolean {
    return left.path === right.path
      && left.lineRange?.startLine === right.lineRange?.startLine
      && left.lineRange?.endLine === right.lineRange?.endLine;
  }

  private mergeSyncedMessageContent(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): string {
    if (!syncedMessage.content?.trim() && existingMessage.content?.trim()) {
      return existingMessage.content;
    }

    return syncedMessage.content;
  }

  private mergeSyncedMessageContentBlocks(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['contentBlocks'] {
    return this.shouldPreserveExistingAssistantContentBlocks(existingMessage, syncedMessage)
      ? existingMessage.contentBlocks
      : syncedMessage.contentBlocks;
  }

  private mergeSyncedMessageToolCalls(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): ChatMessage['toolCalls'] {
    if (syncedMessage.toolCalls?.length) {
      return syncedMessage.toolCalls;
    }

    if (existingMessage.toolCalls?.length) {
      return existingMessage.toolCalls;
    }

    return syncedMessage.toolCalls;
  }

  private getClientOnlyMessagePreservationFlags(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    mergedFields: Pick<ChatMessage, 'content' | 'contentBlocks' | 'toolCalls'>,
  ): Record<string, boolean> {
    return {
      preservedExistingContent:
        mergedFields.content === existingMessage.content
        && mergedFields.content !== syncedMessage.content,
      preservedExistingContentBlocks:
        mergedFields.contentBlocks === existingMessage.contentBlocks,
      preservedExistingToolCalls:
        mergedFields.toolCalls === existingMessage.toolCalls
        && mergedFields.toolCalls !== syncedMessage.toolCalls,
      preservedExistingStructured:
        syncedMessage.structured === undefined
        && existingMessage.structured !== undefined,
      preservedExistingParts: syncedMessage.parts === undefined && existingMessage.parts !== undefined,
    };
  }

  private logClientOnlyMessageFieldPreservation(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    preservedFlags: Record<string, boolean>,
    verbose: boolean,
  ): void {
    if (!verbose || !Object.values(preservedFlags).some(Boolean)) {
      return;
    }

    this.host.logAssistantFinalizationDebug('merge-client-only-message-fields', {
      existingMessage: this.host.summarizeChatMessageForDebug(existingMessage),
      syncedMessage: this.host.summarizeChatMessageForDebug(syncedMessage),
      preservedFlags,
    });
  }

  private shouldPreserveExistingAssistantContentBlocks(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
  ): boolean {
    if (existingMessage.role !== 'assistant') {
      return false;
    }

    const existingBlocks = existingMessage.contentBlocks;
    if (!existingBlocks || existingBlocks.length === 0) {
      return false;
    }

    const syncedBlocks = syncedMessage.contentBlocks;
    if (!syncedBlocks || syncedBlocks.length === 0) {
      return true;
    }

    const existingHasRichBlocks = this.hasRichAssistantContentBlocks(existingBlocks);
    const syncedHasRichBlocks = this.hasRichAssistantContentBlocks(syncedBlocks);
    if (existingHasRichBlocks && !syncedHasRichBlocks) {
      return this.getAssistantTextBlockSignature(existingBlocks, existingMessage.content)
        === this.getAssistantTextBlockSignature(syncedBlocks, syncedMessage.content);
    }

    if (existingBlocks.length <= syncedBlocks.length) {
      return false;
    }

    return this.getAssistantTextBlockSignature(existingBlocks, existingMessage.content)
      === this.getAssistantTextBlockSignature(syncedBlocks, syncedMessage.content);
  }

  private hasRichAssistantContentBlocks(blocks: ContentBlock[]): boolean {
    return blocks.some((block) => block.type !== 'text');
  }

  private getAssistantTextBlockSignature(
    blocks: ContentBlock[] | undefined,
    fallbackContent: string,
  ): string {
    if (!blocks || blocks.length === 0) {
      return fallbackContent.trim();
    }

    return blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join('\n\n');
  }

  private async getLatestServerUserMessageHydration(
    sessionId: string,
  ): Promise<LatestServerUserMessageHydration | null> {
    const serverMessages = await this.host.getSessionMessages(sessionId);
    const latestServerUser = [...serverMessages]
      .reverse()
      .find(({ info }) => info.role === 'user');
    if (!latestServerUser) {
      return null;
    }

    const hydratedMessage = this.host.hydrateOpenCodeMessage(
      latestServerUser.info,
      latestServerUser.parts,
      this.host.getVaultBasePath(),
    );
    const rawServerUserText = latestServerUser.parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');

    return { hydratedMessage, rawServerUserText };
  }

  private logLatestServerUserMessageHydration(
    sessionId: string,
    optimisticMessageId: string,
    hydration: LatestServerUserMessageHydration,
  ): void {
    const { hydratedMessage, rawServerUserText } = hydration;
    logger.debug(`Hydrated latest server user message: ${this.host.stringifyLogPayload({
      sessionId,
      optimisticMessageId,
      sourceMessageId: hydratedMessage.sourceMessageId ?? null,
      rawTextPreview: this.host.getLogPreview(rawServerUserText),
      visibleTextPreview: this.host.getLogPreview(
        this.getVisibleUserMessageText(hydratedMessage),
      ),
      omoDetected: Boolean(hydratedMessage.omo),
      omoKind: hydratedMessage.omo?.kind ?? null,
      omoModeTag: hydratedMessage.omo?.kind === 'user-injection'
        ? hydratedMessage.omo.modeTag
        : null,
    })}`);
  }

  private hasVisibleTextMismatchForHydratedUserMessage(
    optimisticMessage: ChatMessage,
    hydratedMessage: ChatMessage,
    context: HydratedUserMessageMismatchContext,
  ): boolean {
    const optimisticVisibleText = this.getVisibleUserMessageText(optimisticMessage).trim();
    const hydratedVisibleText = this.getVisibleUserMessageText(hydratedMessage).trim();
    if (!optimisticVisibleText || !hydratedVisibleText || optimisticVisibleText === hydratedVisibleText) {
      return false;
    }

    logger.debug(`Skipped optimistic user message hydration due to visible text mismatch: ${this.host.stringifyLogPayload({
      sessionId: context.sessionId,
      optimisticMessageId: context.optimisticMessageId,
      optimisticVisibleTextPreview: this.host.getLogPreview(optimisticVisibleText),
      hydratedVisibleTextPreview: this.host.getLogPreview(hydratedVisibleText),
      rawTextPreview: this.host.getLogPreview(context.rawServerUserText),
      omoDetected: Boolean(hydratedMessage.omo),
      omoKind: hydratedMessage.omo?.kind ?? null,
    })}`);
    return true;
  }

  private getVisibleUserMessageText(message: ChatMessage): string {
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      const visibleText = message.contentBlocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');
      if (visibleText.trim()) {
        return visibleText;
      }
    }

    return message.content ?? '';
  }

  private hasHydratedOptimisticUserMessageChanged(
    optimisticMessage: ChatMessage,
    mergedHydratedMessage: ChatMessage,
  ): boolean {
    return optimisticMessage.sourceMessageId !== mergedHydratedMessage.sourceMessageId
      || optimisticMessage.content !== mergedHydratedMessage.content
      || JSON.stringify(optimisticMessage.omo ?? null)
        !== JSON.stringify(mergedHydratedMessage.omo ?? null)
      || JSON.stringify(optimisticMessage.contextAttachments ?? null)
        !== JSON.stringify(mergedHydratedMessage.contextAttachments ?? null);
  }

  private logSkippedUnchangedHydratedUserMessage(
    sessionId: string,
    optimisticMessageId: string,
    hydratedMessage: ChatMessage,
  ): void {
    logger.debug(`Skipped optimistic user message hydration because nothing changed: ${this.host.stringifyLogPayload({
      sessionId,
      optimisticMessageId,
      sourceMessageId: hydratedMessage.sourceMessageId ?? null,
      omoDetected: Boolean(hydratedMessage.omo),
      omoKind: hydratedMessage.omo?.kind ?? null,
    })}`);
  }

  private async applyHydratedOptimisticUserMessage(
    update: HydratedOptimisticUserMessageUpdate,
  ): Promise<void> {
    const {
      conversation,
      optimisticIndex,
      optimisticMessage,
      mergedHydratedMessage,
      tabId,
    } = update;
    conversation.messages.splice(optimisticIndex, 1, mergedHydratedMessage);
    this.host.armBackgroundTaskIndicatorForUserMessage(mergedHydratedMessage, tabId);
    this.host.updateHydratedUserMessageRuntimeAnchors(
      conversation,
      optimisticMessage,
      mergedHydratedMessage,
      tabId,
    );
    await this.host.saveConversation(conversation);

    if (
      this.host.getCurrentConversationId() !== conversation.id
      || this.host.getActiveTabId() !== tabId
    ) {
      return;
    }

    await this.host.rerenderSingleUserMessage(optimisticMessage.id, mergedHydratedMessage);
    await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
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
    const serverMessages = await this.host.getSessionMessages(conversation.openCodeSessionId);
    const revertState = await this.getConversationServerSyncRevertState(
      conversation,
      serverMessages,
    );
    const convertedServerMessages = serverMessages
      .map(({ info, parts }) =>
        this.host.hydrateOpenCodeMessage(info, parts, this.host.getVaultBasePath()))
      .filter((message) => this.host.shouldRenderConversationMessage(message));

    return { serverMessages, convertedServerMessages, revertState };
  }

  private async getConversationServerSyncRevertState(
    conversation: Conversation,
    serverMessages: OpenCodeSessionMessages,
  ): Promise<ConversationAuthoritativeSyncRevertState | null> {
    if (serverMessages.length > 0) {
      return null;
    }

    return this.host.getSessionRevertState(conversation.openCodeSessionId);
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
    const converted = this.mergeSyncedMessageModelIds(
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
    const previousFingerprint = this.host.getTabRuntimeState(tabId)?.lastConversationSyncFingerprint
      ?? this.host.getConversationSyncFingerprint(conversation.messages);

    return {
      merged,
      preservedClientOnlyMessages,
      fingerprint,
      changed: fingerprint !== previousFingerprint,
    };
  }

  private getClientOnlyMessagesToPreserveOnSync(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
  ): ChatMessage[] {
    return existingMessages.filter((message) => {
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
    merged: ChatMessage[],
    changed: boolean,
  ): Promise<void> {
    conversation.messages = merged;
    if (!changed) {
      return;
    }

    conversation.updatedAt = Date.now();
    await this.host.saveConversation(conversation);
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
      fingerprint: syncMerge.fingerprint,
      revertApplied: Boolean(snapshot.revertState),
      revertMessageId: snapshot.revertState?.messageID ?? null,
    });
  }
}
