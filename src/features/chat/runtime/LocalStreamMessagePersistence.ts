import type { ChatMessage } from '../../../core/types';
import { createLogger } from '../../../shared';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { mapStreamingContentBlocksToMessageContentBlocks } from './sendPipelineContent';
import type {
  LocalStreamOutcome,
  LocalStreamPersistenceHost,
  SendPipelineTabRuntime,
} from './SendPipelineTypes';

const logger = createLogger('LocalStreamMessagePersistence');

export async function persistLocalStreamOutcome(options: {
  host: LocalStreamPersistenceHost;
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  outcome: LocalStreamOutcome;
  logAssistantFinalizationStage: (stage: string, payload?: Record<string, unknown>) => void;
}): Promise<void> {
  const {
    host,
    preparedSend,
    runtime,
    outcome,
    logAssistantFinalizationStage,
  } = options;

  if (outcome.hasStreamContentBlocks && outcome.streamContentBlocks) {
    const assistantMessage: ChatMessage = {
      id: outcome.finalizedAssistantMessageId ?? `assistant-${outcome.finalizedTimestamp}`,
      role: 'assistant',
      content: outcome.streamedTextContent,
      timestamp: outcome.finalizedTimestamp,
      modelId: outcome.finalizedModelId,
      sourceMessageId: outcome.finalizedAssistantMessageId,
      streamState: outcome.shouldPersistInterruptedState ? 'interrupted' : undefined,
      contentBlocks: mapStreamingContentBlocksToMessageContentBlocks(outcome.streamContentBlocks),
      questionResolution: runtime.pendingQuestionResolution ?? undefined,
    };
    logAssistantFinalizationStage('local-assistant-message-built', {
      message: host.summarizeChatMessageForDebug(assistantMessage),
    });

    if (outcome.shouldPersistInterruptedState) {
      logInterruptedAssistantPersistence(host, preparedSend, assistantMessage);
    }

    writeShellDataset(runtime.streamingMessageEl, assistantMessage);
    preparedSend.conversation.messages.push(assistantMessage);
    logAssistantFinalizationStage('local-assistant-message-appended', {
      conversationMessageCount: preparedSend.conversation.messages.length,
      message: host.summarizeChatMessageForDebug(assistantMessage),
    });
  } else if (outcome.streamErrorNoticeMessage) {
    appendNoticeMessage({
      conversation: preparedSend.conversation,
      host,
      message: outcome.streamErrorNoticeMessage,
      logAssistantFinalizationStage,
      stage: 'local-error-notice-appended',
    });
  } else if (outcome.interruptedNoticeMessage) {
    logInterruptedNoticePersistence(host, preparedSend, outcome.interruptedNoticeMessage);
    appendNoticeMessage({
      conversation: preparedSend.conversation,
      host,
      message: outcome.interruptedNoticeMessage,
      logAssistantFinalizationStage,
      stage: 'local-interrupted-notice-appended',
    });
  }

  if (!outcome.hasStreamContentBlocks && !outcome.streamErrorNoticeMessage && !outcome.interruptedNoticeMessage) {
    return;
  }

  preparedSend.conversation.updatedAt = outcome.finalizedTimestamp;
  preparedSend.conversation.lastResponseAt = outcome.finalizedTimestamp;
  await host.saveConversation(preparedSend.conversation);
  logAssistantFinalizationStage('conversation-saved-after-local-finalization', {
    updatedAt: preparedSend.conversation.updatedAt,
    lastResponseAt: preparedSend.conversation.lastResponseAt ?? null,
    messageCount: preparedSend.conversation.messages.length,
  });
}

function appendNoticeMessage(options: {
  conversation: PreparedMessageSend['conversation'];
  host: LocalStreamPersistenceHost;
  message: ChatMessage;
  logAssistantFinalizationStage: (stage: string, payload?: Record<string, unknown>) => void;
  stage: string;
}): void {
  options.conversation.messages.push(options.message);
  options.logAssistantFinalizationStage(options.stage, {
    conversationMessageCount: options.conversation.messages.length,
    latestAssistantMessage: options.host.summarizeChatMessageForDebug(options.message),
  });
}

function writeShellDataset(messageEl: HTMLElement | null, message: ChatMessage): void {
  if (!messageEl) {
    return;
  }

  messageEl.dataset.messageId = message.id;
  if (message.sourceMessageId) {
    messageEl.dataset.sourceMessageId = message.sourceMessageId;
  } else {
    delete messageEl.dataset.sourceMessageId;
  }
}

function logInterruptedAssistantPersistence(
  host: LocalStreamPersistenceHost,
  preparedSend: PreparedMessageSend,
  message: ChatMessage,
): void {
  logger.debug(`Persisting interrupted assistant message after stream cancellation: ${host.stringifyLogPayload({
    tabId: preparedSend.tabId,
    conversationId: preparedSend.conversation.id,
    sessionId: preparedSend.conversation.openCodeSessionId,
    messageId: message.id,
    sourceMessageId: message.sourceMessageId ?? null,
    contentPreview: host.getLogPreview(message.content, 160),
    contentBlockCount: message.contentBlocks?.length ?? 0,
  })}`);
}

function logInterruptedNoticePersistence(
  host: LocalStreamPersistenceHost,
  preparedSend: PreparedMessageSend,
  message: ChatMessage,
): void {
  logger.debug(`Persisting interrupted assistant notice because no visible assistant content survived cancellation: ${host.stringifyLogPayload({
    tabId: preparedSend.tabId,
    conversationId: preparedSend.conversation.id,
    sessionId: preparedSend.conversation.openCodeSessionId,
    noticeId: message.id,
  })}`);
}
