import type {
  ChatMessage,
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
    backend?: string,
  ): ChatMessage {
    const contextAttachments = this.mergeSyncedMessageContextAttachments(existingMessage, syncedMessage);
    const preservedFlags = this.getClientOnlyMessagePreservationFlags(
      existingMessage,
      syncedMessage,
      { contextAttachments },
      backend,
    );
    this.logClientOnlyMessageFieldPreservation(
      existingMessage,
      syncedMessage,
      preservedFlags,
      verbose,
    );

    const shouldPreserveStructured = backend === 'claude-code'
      && existingMessage.structured !== undefined
      && syncedMessage.structured === undefined;

    return {
      ...syncedMessage,
      contextAttachments,
      questionResolution: syncedMessage.questionResolution ?? existingMessage.questionResolution,
      structured: shouldPreserveStructured ? existingMessage.structured : syncedMessage.structured,
    };
  }

  mergeSyncedConversationMessages(
    existingMessages: ChatMessage[],
    syncedMessages: ChatMessage[],
    verbose = true,
    backend?: string,
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
        ? this.mergeClientOnlyMessageFields(existingMessage, message, verbose, backend)
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
    if (!syncedAttachments?.length) {
      return undefined;
    }

    if (!existingAttachments?.length) {
      return syncedAttachments;
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

  private getClientOnlyMessagePreservationFlags(
    existingMessage: ChatMessage,
    syncedMessage: ChatMessage,
    mergedFields: Pick<ChatMessage, 'contextAttachments'>,
    backend?: string,
  ): Record<string, boolean> {
    return {
      preservedExistingContextAttachments:
        mergedFields.contextAttachments === existingMessage.contextAttachments
        && mergedFields.contextAttachments !== syncedMessage.contextAttachments,
      preservedExistingQuestionResolution:
        syncedMessage.questionResolution === undefined
        && existingMessage.questionResolution !== undefined,
      preservedExistingStructured:
        backend === 'claude-code'
        && existingMessage.structured !== undefined
        && syncedMessage.structured === undefined,
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
}
