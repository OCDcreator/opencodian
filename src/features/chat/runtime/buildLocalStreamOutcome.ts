import type { ContentBlock as StreamingContentBlock } from '../../../utils/streaming';
import { shouldSyncAfterStream } from '../services/MessageFinalizationService';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import { buildStreamErrorNotice } from './AssistantNoticeRenderer';
import { filterDuplicateStructuredOutputTextBlocks, getStreamedTextContent } from './sendPipelineContent';
import type {
  LocalStreamOutcome,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  StreamChunkRouterResult,
} from './SendPipelineTypes';

function applyCodexNativeTextSnapshot(
  preparedSend: PreparedMessageSend,
  routedStream: StreamChunkRouterResult,
  blocks: StreamingContentBlock[] | undefined,
): Pick<LocalStreamOutcome, 'streamContentBlocks' | 'finalizedAssistantTurnId' | 'requiresNativeTextRender'> {
  const native = routedStream.finalizedAssistantMetadata;
  if (preparedSend.conversation.backend !== 'codex' || !routedStream.streamCompleted || routedStream.latestErrorMessage
    || typeof native?.nativeText !== 'string' || !native.sourceTurnId
    || native.sourceTurnId !== routedStream.resolvedUserMessageTurnId
    || !(blocks ?? []).every((block) => block.type === 'text' || block.type === 'thinking')) return { streamContentBlocks: blocks };
  const corrected = getStreamedTextContent(blocks) !== native.nativeText;
  return {
    streamContentBlocks: corrected ? [...(blocks ?? []).filter((block) => block.type === 'thinking'), { type: 'text', content: native.nativeText }] : blocks,
    finalizedAssistantTurnId: native.sourceTurnId,
    ...(corrected ? { requiresNativeTextRender: true } : {}),
  };
}

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
  const rawContentBlocks = options.streamController?.getContentBlocks();
  const filteredBlocks = filterDuplicateStructuredOutputTextBlocks(
    rawContentBlocks,
    options.routedStream.structuredOutput,
  );
  const nativeOutcome = applyCodexNativeTextSnapshot(options.preparedSend, options.routedStream, filteredBlocks);
  const streamContentBlocks = nativeOutcome.streamContentBlocks;
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
  const backend = options.preparedSend.conversation.backend ?? 'opencode';

  return {
    finalizedTimestamp,
    finalizedModelId,
    finalizedAssistantMessageId,
    ...nativeOutcome,
    finalizedBackendSessionId,
    finalizedStreamingMessageEl: options.runtime.streamingMessageEl,
    streamContentBlocks,
    streamedTextContent,
    hasStreamContentBlocks,
    shouldPersistInterruptedState: effectiveShouldPersistInterruptedState,
    streamErrorNoticeMessage: streamErrorNoticeMessage ?? retryErrorNoticeMessage,
    interruptedNoticeMessage: null,
    shouldSyncFromServer: (backend === 'opencode' || backend === 'opencode2' || backend === 'pi')
      && shouldSyncAfterStream({
        streamCompleted: options.routedStream.streamCompleted,
        streamTimedOut: options.routedStream.streamTimedOut,
        streamInterrupted: options.routedStream.streamInterrupted,
        latestErrorMessage: options.routedStream.latestErrorMessage,
      }),
    structuredOutput: options.routedStream.structuredOutput,
    resolvedUserMessageIdentity: options.routedStream.resolvedUserMessageIdentity,
    ...(options.routedStream.resolvedUserMessageTurnId ? { resolvedUserMessageTurnId: options.routedStream.resolvedUserMessageTurnId } : {}),
  };
}
