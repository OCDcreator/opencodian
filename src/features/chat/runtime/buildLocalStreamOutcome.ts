import { shouldSyncAfterStream } from '../services/MessageFinalizationService';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { getStreamedTextContent } from './sendPipelineContent';
import type {
  LocalStreamOutcomeHost,
  LocalStreamOutcome,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  StreamChunkRouterResult,
} from './SendPipelineTypes';

export function buildLocalStreamOutcome(options: {
  host: LocalStreamOutcomeHost;
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  streamController: SendPipelineStreamController | null;
  routedStream: StreamChunkRouterResult;
}): LocalStreamOutcome {
  const finalizedTimestamp = options.routedStream.finalizedAssistantMetadata?.timestamp ?? Date.now();
  const finalizedModelId = options.routedStream.finalizedAssistantMetadata?.modelId
    ?? options.preparedSend.activeModelId;
  const finalizedAssistantMessageId = options.routedStream.finalizedAssistantMetadata?.messageId;
  const streamContentBlocks = options.streamController?.getContentBlocks();
  const streamedTextContent = getStreamedTextContent(streamContentBlocks);
  const hasStreamContentBlocks = Boolean(streamContentBlocks && streamContentBlocks.length > 0);
  const shouldPersistInterruptedState = options.routedStream.streamInterrupted
    && !options.routedStream.streamCompleted
    && !options.routedStream.latestErrorMessage;
  const streamErrorNoticeMessage = options.routedStream.latestErrorMessage && !hasStreamContentBlocks
    ? options.host.buildStreamErrorNotice(
        finalizedTimestamp,
        options.routedStream.latestErrorMessage,
        finalizedModelId,
        finalizedAssistantMessageId,
      )
    : null;

  return {
    finalizedTimestamp,
    finalizedModelId,
    finalizedAssistantMessageId,
    finalizedStreamingMessageEl: options.runtime.streamingMessageEl,
    streamContentBlocks,
    streamedTextContent,
    hasStreamContentBlocks,
    shouldPersistInterruptedState,
    streamErrorNoticeMessage,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: shouldSyncAfterStream({
      streamCompleted: options.routedStream.streamCompleted,
      streamTimedOut: options.routedStream.streamTimedOut,
      streamInterrupted: options.routedStream.streamInterrupted,
      latestErrorMessage: options.routedStream.latestErrorMessage,
    }),
  };
}
