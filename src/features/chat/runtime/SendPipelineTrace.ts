import {
  getConversationBackendSessionId,
  type StreamChunk as CoreStreamChunk,
} from '../../../core/types';
import type { StreamChunk as StreamingChunk } from '../../../utils/streaming';
import type { PreparedMessageSend } from '../services/MessageSendPreparationService';
import type {
  SendPipelineDebugContentBlock,
  SendPipelineStreamController,
  SendPipelineTabRuntime,
  SendPipelineTraceHost,
  SendPipelineTraceState,
} from './SendPipelineTypes';

const STREAM_PROGRESS_LOG_MIN_INTERVAL_MS = 1200;
const STREAM_PROGRESS_LOG_MIN_TEXT_DELTA = 400;

interface SendPipelineTraceOptions {
  host: SendPipelineTraceHost;
  preparedSend: PreparedMessageSend;
  runtime: SendPipelineTabRuntime;
  getState: () => SendPipelineTraceState;
  getStreamController: () => SendPipelineStreamController | null;
}

export class SendPipelineTrace {
  private readonly traceId: string;
  private rawStreamChunkCount = 0;
  private renderedStreamChunkCount = 0;
  private lastRawTextChunk: Record<string, unknown> | null = null;
  private lastRenderedTextChunk: Record<string, unknown> | null = null;
  private totalRenderedTextLength = 0;
  private lastProgressLoggedAt = 0;
  private lastProgressLoggedTextLength = 0;

  constructor(private readonly options: SendPipelineTraceOptions) {
    this.traceId = `${getConversationBackendSessionId(options.preparedSend.conversation) ?? 'no-backend-session'}:${options.preparedSend.userMessage.id}:${Date.now()}`;
  }

  noteRawChunk(chunk: CoreStreamChunk): void {
    this.rawStreamChunkCount += 1;
    if (chunk.type !== 'text' || chunk.content.length === 0) {
      return;
    }

    this.lastRawTextChunk = {
      sequence: this.rawStreamChunkCount,
      length: chunk.content.length,
      preview: this.options.host.getLogPreview(chunk.content, 120),
    };
  }

  noteRenderedChunk(chunk: StreamingChunk): void {
    this.renderedStreamChunkCount += 1;
    if (chunk.type !== 'text' || chunk.content.length === 0) {
      return;
    }

    this.totalRenderedTextLength += chunk.content.length;
    this.lastRenderedTextChunk = {
      sequence: this.renderedStreamChunkCount,
      length: chunk.content.length,
      preview: this.options.host.getLogPreview(chunk.content, 120),
    };
  }

  logProgress(
    chunk: StreamingChunk,
    options: {
      pendingIndicatorVisible: boolean;
      isFirstVisibleText: boolean;
    },
  ): void {
    const progress = this.getProgressLogPayload(chunk, options.isFirstVisibleText);
    if (!progress) {
      return;
    }

    const now = Date.now();
    const shouldLog = progress.reason !== 'text-growth'
      || this.lastProgressLoggedAt === 0
      || this.totalRenderedTextLength - this.lastProgressLoggedTextLength >= STREAM_PROGRESS_LOG_MIN_TEXT_DELTA
      || now - this.lastProgressLoggedAt >= STREAM_PROGRESS_LOG_MIN_INTERVAL_MS;
    if (!shouldLog) {
      return;
    }

    this.lastProgressLoggedAt = now;
    this.lastProgressLoggedTextLength = this.totalRenderedTextLength;
    this.logStage('stream-progress', {
      ...progress.payload,
      reason: progress.reason,
      totalRenderedTextLength: this.totalRenderedTextLength,
      messageVisible: !(this.options.runtime.streamingMessageEl?.hidden ?? true),
      pendingIndicatorVisible: options.pendingIndicatorVisible,
      streamController: this.getStreamControllerSnapshot(),
    });
  }

  logStage(stage: string, payload: Record<string, unknown> = {}): void {
    const state = this.options.getState();
    this.options.host.logAssistantFinalizationDebug(stage, {
      traceId: this.traceId,
      tabId: this.options.preparedSend.tabId,
      conversationId: this.options.preparedSend.conversation.id,
      sessionId: getConversationBackendSessionId(this.options.preparedSend.conversation),
      userMessageId: this.options.preparedSend.userMessage.id,
      streamCompleted: state.streamCompleted,
      streamInterrupted: state.streamInterrupted,
      streamTimedOut: state.streamTimedOut,
      latestErrorMessage: state.latestErrorMessage
        ? this.options.host.getLogPreview(state.latestErrorMessage, 160)
        : null,
      rawStreamChunkCount: this.rawStreamChunkCount,
      renderedStreamChunkCount: this.renderedStreamChunkCount,
      lastRawTextChunk: this.lastRawTextChunk,
      lastRenderedTextChunk: this.lastRenderedTextChunk,
      finalizedAssistantMetadata: state.finalizedAssistantMetadata
        ? {
            messageId: state.finalizedAssistantMetadata.messageId,
            timestamp: state.finalizedAssistantMetadata.timestamp,
            modelId: state.finalizedAssistantMetadata.modelId ?? null,
          }
        : null,
      ...payload,
    });
  }

  snapshotStreamController(): Record<string, unknown> {
    return this.getStreamControllerSnapshot();
  }

  private getProgressLogPayload(
    chunk: StreamingChunk,
    isFirstVisibleText: boolean,
  ): {
    reason: 'first-content' | 'text-growth' | 'thinking' | 'tool' | 'error';
    payload: Record<string, unknown>;
  } | null {
    const payload: Record<string, unknown> = {
      renderedChunkSequence: this.renderedStreamChunkCount,
    };

    if (chunk.type === 'text' && chunk.content.length > 0) {
      payload.chunkLength = chunk.content.length;
      return {
        reason: isFirstVisibleText ? 'first-content' : 'text-growth',
        payload,
      };
    }
    if (chunk.type === 'thinking' && chunk.content.trim()) {
      payload.chunkLength = chunk.content.length;
      return { reason: 'thinking', payload };
    }
    if (chunk.type === 'tool_use') {
      payload.toolName = chunk.name;
      return { reason: 'tool', payload };
    }
    if (chunk.type === 'error') {
      payload.errorPreview = this.options.host.getLogPreview(chunk.content, 160);
      return { reason: 'error', payload };
    }

    return null;
  }

  private getStreamControllerSnapshot(): Record<string, unknown> {
    return {
      hasController: Boolean(this.options.getStreamController()),
      persistedBlocks: this.options.host.summarizeContentBlocksForDebug(
        this.options.getStreamController()?.getContentBlocks() as SendPipelineDebugContentBlock[] | undefined,
      ),
    };
  }
}
