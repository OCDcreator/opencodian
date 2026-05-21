import { shouldSyncAfterStream } from '../services/MessageFinalizationService';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { buildStreamErrorNotice } from './AssistantNoticeRenderer';
import { getStreamedTextContent } from './sendPipelineContent';
import type {
  LocalStreamOutcome,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  StreamChunkRouterResult,
} from './SendPipelineTypes';

export function buildLocalStreamOutcome(options: {
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  streamController: SendPipelineStreamController | null;
  routedStream: StreamChunkRouterResult;
  sessionRetryMessage?: string | null;
}): LocalStreamOutcome {
  const finalizedTimestamp = options.routedStream.finalizedAssistantMetadata?.timestamp ?? Date.now();
  const finalizedModelId = options.routedStream.finalizedAssistantMetadata?.modelId
    ?? options.preparedSend.activeModelId;
  const finalizedAssistantMessageId = options.routedStream.finalizedAssistantMetadata?.messageId;
  const finalizedBackendSessionId = options.routedStream.finalizedBackendSessionId ?? undefined;
  const streamContentBlocks = options.streamController?.getContentBlocks();
  const streamedTextContent = getStreamedTextContent(streamContentBlocks);
  const hasStreamContentBlocks = Boolean(streamContentBlocks && streamContentBlocks.length > 0);
  const shouldPersistInterruptedState = options.routedStream.streamInterrupted
    && !options.routedStream.streamCompleted
    && !options.routedStream.latestErrorMessage;
  const streamErrorNoticeMessage = options.routedStream.latestErrorMessage && !hasStreamContentBlocks
    ? buildStreamErrorNotice(
        finalizedTimestamp,
        options.routedStream.latestErrorMessage,
        finalizedModelId,
        finalizedAssistantMessageId,
      )
    : null;
  const retryErrorNoticeMessage = shouldPersistInterruptedState && !hasStreamContentBlocks && options.sessionRetryMessage
    ? buildStreamErrorNotice(
        finalizedTimestamp,
        options.sessionRetryMessage,
        finalizedModelId,
        finalizedAssistantMessageId,
      )
    : null;
  const effectiveShouldPersistInterruptedState = retryErrorNoticeMessage
    ? false
    : shouldPersistInterruptedState;

  return {
    finalizedTimestamp,
    finalizedModelId,
    finalizedAssistantMessageId,
    finalizedBackendSessionId,
    finalizedStreamingMessageEl: options.runtime.streamingMessageEl,
    streamContentBlocks,
    streamedTextContent,
    hasStreamContentBlocks,
    shouldPersistInterruptedState: effectiveShouldPersistInterruptedState,
    streamErrorNoticeMessage: streamErrorNoticeMessage ?? retryErrorNoticeMessage,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: shouldSyncAfterStream({
      streamCompleted: options.routedStream.streamCompleted,
      streamTimedOut: options.routedStream.streamTimedOut,
      streamInterrupted: options.routedStream.streamInterrupted,
      latestErrorMessage: options.routedStream.latestErrorMessage,
    }),
  };
}
