import type { OpenCodeService } from '../../../core/opencode';
import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import { ConversationAuthoritativeMessageMergeCoordinator } from './ConversationAuthoritativeMessageMergeCoordinator';
import { ConversationAuthoritativeReloadCoordinator } from './ConversationAuthoritativeReloadCoordinator';

const logger = createLogger('OpenCodianView');

type OpenCodeSessionMessages = Awaited<ReturnType<OpenCodeService['getSessionMessages']>>;
type OpenCodeSessionMessage = OpenCodeSessionMessages[number];

interface LatestServerUserMessageHydration {
  hydratedMessage: ChatMessage;
  rawServerUserText: string;
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
  getCanonicalSessionMessages(sessionId: string): OpenCodeSessionMessages | null;
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
  private readonly messageMergeCoordinator: ConversationAuthoritativeMessageMergeCoordinator;
  private readonly reloadCoordinator: ConversationAuthoritativeReloadCoordinator;

  constructor(private readonly host: ConversationAuthoritativeSyncHost) {
    this.messageMergeCoordinator = new ConversationAuthoritativeMessageMergeCoordinator(host);
    this.reloadCoordinator = new ConversationAuthoritativeReloadCoordinator({
      host,
      mergeSyncedConversationMessages: (existingMessages, syncedMessages, verbose) =>
        this.messageMergeCoordinator.mergeSyncedConversationMessages(
          existingMessages,
          syncedMessages,
          verbose,
        ),
    });
  }

  mergeClientOnlyMessageFields(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    verbose = true,
  ): ChatMessage {
    return this.messageMergeCoordinator.mergeClientOnlyMessageFields(
      existingMessage,
      syncedMessage,
      verbose,
    );
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
    return this.reloadCoordinator.syncConversationMessagesFromServer(
      conversation,
      tabId,
      reason,
      options,
    );
  }

  async syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason = 'sync-event',
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationAuthoritativeSyncResult | null> {
    return this.reloadCoordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      tabId,
      reason,
      options,
    );
  }

  private async getLatestServerUserMessageHydration(
    sessionId: string,
  ): Promise<LatestServerUserMessageHydration | null> {
    const serverMessages = await this.host.getSessionMessages(sessionId);
    const latestServerUser = [...serverMessages].reverse().find((message) => message.info.role === 'user');
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
}
