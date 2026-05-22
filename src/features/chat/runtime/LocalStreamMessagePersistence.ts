import type { ChatMessage } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
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

  let persistLocalMessage: (() => void) | null = null;

  if (outcome.hasStreamContentBlocks && outcome.streamContentBlocks) {
    const shouldPersistAssistantMessage = shouldPersistLocalAssistantMessage(
      outcome,
      runtime,
    );
    if (!shouldPersistAssistantMessage) {
      await persistBackendSessionIdentityIfNeeded({
        host,
        preparedSend,
        outcome,
        logAssistantFinalizationStage,
      });
      logAssistantFinalizationStage('local-assistant-cache-deferred', {
        finalizedAssistantMessageId: outcome.finalizedAssistantMessageId ?? null,
        reason: 'canonical-sync-pending',
      });
      return;
    }

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
      structured: outcome.structuredOutput,
    };
    logAssistantFinalizationStage('local-assistant-message-built', {
      message: host.summarizeChatMessageForDebug(assistantMessage),
    });

    if (outcome.shouldPersistInterruptedState) {
      logInterruptedAssistantPersistence(host, preparedSend, assistantMessage);
    }

    persistLocalMessage = () => {
      writeShellDataset(runtime.streamingMessageEl, assistantMessage);
      preparedSend.conversation.messages.push(assistantMessage);
      logAssistantFinalizationStage('local-assistant-message-appended', {
        conversationMessageCount: preparedSend.conversation.messages.length,
        message: host.summarizeChatMessageForDebug(assistantMessage),
      });
    };
  } else if (outcome.streamErrorNoticeMessage) {
    persistLocalMessage = () => {
      appendNoticeMessage({
        conversation: preparedSend.conversation,
        host,
        message: outcome.streamErrorNoticeMessage as ChatMessage,
        logAssistantFinalizationStage,
        stage: 'local-error-notice-appended',
      });
    };
  } else if (outcome.interruptedNoticeMessage) {
    logInterruptedNoticePersistence(host, preparedSend, outcome.interruptedNoticeMessage);
    persistLocalMessage = () => {
      appendNoticeMessage({
        conversation: preparedSend.conversation,
        host,
        message: outcome.interruptedNoticeMessage as ChatMessage,
        logAssistantFinalizationStage,
        stage: 'local-interrupted-notice-appended',
      });
    };
  }

  if (!persistLocalMessage) {
    await persistBackendSessionIdentityIfNeeded({
      host,
      preparedSend,
      outcome,
      logAssistantFinalizationStage,
    });
    return;
  }

  const writeTicket = host.createConversationWriteTicket(preparedSend.conversation.id);
  const writeApplied = await host.commitConversationWrite(
    preparedSend.conversation,
    writeTicket,
    'local-stream-finalization',
    () => {
      if (outcome.finalizedBackendSessionId) {
        preparedSend.conversation.backendSessionId = outcome.finalizedBackendSessionId;
      }
      persistLocalMessage?.();
      preparedSend.conversation.updatedAt = outcome.finalizedTimestamp;
      preparedSend.conversation.lastResponseAt = outcome.finalizedTimestamp;
    },
  );
  if (!writeApplied) {
    logAssistantFinalizationStage('local-stream-finalization-write-skipped', {
      conversationId: preparedSend.conversation.id,
      messageCount: preparedSend.conversation.messages.length,
    });
    return;
  }

  logAssistantFinalizationStage('conversation-saved-after-local-finalization', {
    updatedAt: preparedSend.conversation.updatedAt,
    lastResponseAt: preparedSend.conversation.lastResponseAt ?? null,
    messageCount: preparedSend.conversation.messages.length,
  });
}

async function persistBackendSessionIdentityIfNeeded(options: {
  host: LocalStreamPersistenceHost;
  preparedSend: PreparedMessageSend;
  outcome: LocalStreamOutcome;
  logAssistantFinalizationStage: (stage: string, payload?: Record<string, unknown>) => void;
}): Promise<void> {
  const sessionId = options.outcome.finalizedBackendSessionId;
  if (!sessionId || getConversationBackendSessionId(options.preparedSend.conversation) === sessionId) {
    return;
  }

  const writeTicket = options.host.createConversationWriteTicket(options.preparedSend.conversation.id);
  const writeApplied = await options.host.commitConversationWrite(
    options.preparedSend.conversation,
    writeTicket,
    'backend-session-id-finalization',
    () => {
      options.preparedSend.conversation.backendSessionId = sessionId;
    },
  );
  options.logAssistantFinalizationStage(
    writeApplied ? 'backend-session-id-finalized' : 'backend-session-id-finalization-skipped',
    {
      backendSessionId: sessionId,
    },
  );
}

function shouldPersistLocalAssistantMessage(
  outcome: LocalStreamOutcome,
  runtime: SendPipelineTabRuntime,
): boolean {
  if (!outcome.shouldSyncFromServer) {
    return true;
  }

  return Boolean(
    outcome.shouldPersistInterruptedState
      || runtime.pendingQuestionResolution,
  );
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
    sessionId: getConversationBackendSessionId(preparedSend.conversation),
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
    sessionId: getConversationBackendSessionId(preparedSend.conversation),
    noticeId: message.id,
  })}`);
}
