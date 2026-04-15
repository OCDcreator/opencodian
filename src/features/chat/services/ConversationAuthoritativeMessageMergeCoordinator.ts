import type {
  ChatMessage,
  ContentBlock,
} from '../../../core/types';
import type { ConversationAuthoritativeSyncHost } from './ConversationAuthoritativeSyncCoordinator';

type ConversationAuthoritativeMessageMergeHost = Pick<
  ConversationAuthoritativeSyncHost,
  'logAssistantFinalizationDebug' | 'summarizeChatMessageForDebug'
>;

export class ConversationAuthoritativeMessageMergeCoordinator {
  constructor(private readonly host: ConversationAuthoritativeMessageMergeHost) {}

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

  mergeSyncedConversationMessages(
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
      .filter((block) => block.type === 'text')
      .map((block) => block.text?.trim() ?? '')
      .join('\n');
  }
}
