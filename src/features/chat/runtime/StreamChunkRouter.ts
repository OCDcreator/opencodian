import {
  getConversationBackendSessionId,
  type StreamChunk as CoreStreamChunk,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import { PendingIndicatorController } from './PendingIndicatorController';
import { hasVisibleStreamingContent } from './sendPipelineContent';
import { SendPipelineTrace } from './SendPipelineTrace';
import type {
  SendPipelineTraceState,
  StreamChunkRouterHost,
  StreamChunkRouterOptions,
  StreamChunkRouterResult,
} from './SendPipelineTypes';

const logger = createLogger('StreamChunkRouter');
const STREAM_IDLE_TIMEOUT_MS = 300000;
const STREAM_NO_VISIBLE_CONTENT_TIMEOUT_MS = 60000;

export class StreamChunkRouter {
  private timeoutId: number | null = null;
  private readonly pendingIndicator: PendingIndicatorController;
  private readonly trace: SendPipelineTrace;
  private streamCompleted = false;
  private streamInterrupted = false;
  private streamTimedOut = false;
  private latestErrorMessage: string | null = null;
  private finalizedAssistantMetadata: Extract<CoreStreamChunk, { type: 'message_metadata' }> | null = null;
  private receivedMeaningfulChunk = false;
  private receivedFirstVisibleContent = false;
  private structuredOutput: unknown | undefined;

  constructor(private readonly options: StreamChunkRouterOptions) {
    this.pendingIndicator = new PendingIndicatorController(
      options.host,
      options.preparedSend.tabId,
      options.contentEl,
    );
    this.trace = new SendPipelineTrace({
      host: options.host,
      preparedSend: options.preparedSend,
      runtime: options.runtime,
      getState: () => this.getTraceState(),
      getStreamController: () => this.options.streamController,
    });
  }

  async consume(): Promise<StreamChunkRouterResult> {
    this.scheduleStreamTimeout();
    this.startStreamingUi();

    try {
      for await (const chunk of this.options.stream) {
        this.trace.noteRawChunk(chunk);
        if (!this.options.runtime.isStreaming) {
          logger.debug('Streaming cancelled, breaking loop');
          this.streamInterrupted = true;
          this.trace.logStage('stream-loop-break-not-streaming');
          break;
        }

        this.scheduleStreamTimeout();
        if (await this.handleControlChunk(chunk)) {
          continue;
        }
        if (await this.handleInteractiveChunk(chunk)) {
          continue;
        }
        await this.handleRenderableChunk(chunk);
      }

      await this.injectFallbackErrorIfNeeded();
      await this.dispatchDoneIfNeeded();
    } catch (error) {
      this.handleStreamError(error);
      await this.renderErrorToStreamController();
    }

    return {
      ...this.getTraceState(),
      logAssistantFinalizationStage: (stage, payload = {}) => {
        this.trace.logStage(stage, payload);
      },
      resetStreamingState: () => {
        this.resetStreamingState();
      },
      cleanupPendingIndicator: () => {
        this.pendingIndicator.clear();
      },
      structuredOutput: this.structuredOutput,
    };
  }

  private startStreamingUi(): void {
    if (this.options.host.getActiveTabId() === this.options.preparedSend.tabId) {
      this.options.host.scheduleSettledScrollToBottomIfNeeded(
        this.options.host.shouldAutoScroll(this.options.preparedSend.tabId),
        this.options.preparedSend.tabId,
      );
    }

    this.pendingIndicator.schedule(this.options.runtime, ({ pendingMessage, revealReason }) => {
      this.trace.logStage('pending-indicator-shown', {
        pendingMessage,
        revealReason,
      });
    });
    this.trace.logStage('trace-armed', {
      activeModelId: this.options.preparedSend.activeModelId,
      pendingMessage: this.pendingIndicator.message,
      streamControllerAvailable: Boolean(this.options.streamController),
    });

    if (!this.options.streamController) {
      return;
    }

    this.options.streamController.startStream(this.options.contentEl);
    this.trace.logStage('stream-controller-started', {
      activeModelId: this.options.preparedSend.activeModelId,
      pendingMessage: this.pendingIndicator.message,
      streamController: this.trace.snapshotStreamController(),
    });
  }

  private async handleControlChunk(chunk: CoreStreamChunk): Promise<boolean> {
    const { host, preparedSend } = this.options;

    if (chunk.type === 'message_start') {
      this.trace.logStage('message-start-received');
      void host.syncLatestUserMessageFromServer(
        preparedSend.conversation,
        preparedSend.userMessage.id,
        preparedSend.tabId,
      );
      host.beginTabContextUsageStream(preparedSend.tabId);
      return true;
    }

    if (chunk.type === 'usage') {
      host.applyUsageChunkToTab(preparedSend.tabId, chunk);
      return true;
    }

    if (chunk.type === 'message_metadata') {
      this.finalizedAssistantMetadata = chunk;
      this.trace.logStage('message-metadata-received', {
        metadata: host.summarizeCoreStreamChunkForDebug(chunk),
      });
      return true;
    }

    if (chunk.type === 'message_stop') {
      this.streamCompleted = true;
      host.completeTabContextUsageStream(preparedSend.tabId);
      this.trace.logStage('message-stop-received', {
        streamController: this.trace.snapshotStreamController(),
      });
      return true;
    }

    if (chunk.type === 'file_edited') {
      this.options.runtime.pendingEditedFiles.add(chunk.file);
      this.trace.logStage('file-edited-recorded', {
        file: chunk.file,
        pendingEditedFileCount: this.options.runtime.pendingEditedFiles.size,
      });
      return true;
    }

    if (chunk.type === 'backend_event' && chunk.event === 'structured_output') {
      this.structuredOutput = chunk.metadata?.structuredOutput;
      this.trace.logStage('structured-output-received', {
        hasPayload: chunk.metadata?.structuredOutput !== undefined,
      });
      return true;
    }

    return false;
  }

  private async handleInteractiveChunk(chunk: CoreStreamChunk): Promise<boolean> {
    const { host, preparedSend, runtime } = this.options;

    if (chunk.type === 'permission_request') {
      this.receivedMeaningfulChunk = true;
      this.clearStreamTimeout();
      await host.showPermissionDialog(chunk, preparedSend.tabId);
      if (runtime.isStreaming) {
        this.scheduleStreamTimeout();
      }
      return true;
    }

    if (chunk.type === 'question_request') {
      this.receivedMeaningfulChunk = true;
      this.clearStreamTimeout();
      await host.showQuestionDialog(chunk.request, preparedSend.tabId);
      if (runtime.isStreaming) {
        this.scheduleStreamTimeout();
      }
      return true;
    }

    return false;
  }

  private async handleRenderableChunk(chunk: CoreStreamChunk): Promise<void> {
    const streamingChunk = this.options.host.convertToStreamingChunk(chunk);
    if (!streamingChunk || !this.options.streamController) {
      return;
    }

    this.trace.noteRenderedChunk(streamingChunk);
    if (streamingChunk.type === 'error') {
      this.latestErrorMessage = this.options.host.getFriendlyStreamErrorMessage(streamingChunk.content);
      streamingChunk.content = this.latestErrorMessage;
    } else {
      this.receivedMeaningfulChunk = true;
    }

    await this.options.streamController.handleChunk(streamingChunk);
    const isFirstVisibleText = !this.receivedFirstVisibleContent
      && streamingChunk.type === 'text'
      && streamingChunk.content.length > 0;
    this.trace.logProgress(streamingChunk, {
      pendingIndicatorVisible: this.pendingIndicator.isVisible,
      isFirstVisibleText,
    });
    this.revealStreamingMessageIfNeeded(streamingChunk);
    this.clearPendingIndicatorOnFirstVisibleContent(streamingChunk);
  }

  private async injectFallbackErrorIfNeeded(): Promise<void> {
    if (
      !this.options.runtime.isStreaming
      || this.receivedMeaningfulChunk
      || this.latestErrorMessage
      || !this.options.streamController
    ) {
      return;
    }

    this.latestErrorMessage = this.options.host.getFriendlyStreamErrorMessage('');
    this.trace.logStage('injecting-fallback-error-before-done');
    await this.options.streamController.handleChunk({
      type: 'error',
      content: this.latestErrorMessage,
    });
    this.options.host.revealStreamingAssistantMessageElement(this.options.preparedSend.tabId);
  }

  private async dispatchDoneIfNeeded(): Promise<void> {
    if (!this.options.runtime.isStreaming || !this.options.streamController) {
      return;
    }

    this.trace.logStage('render-done-dispatch', {
      streamController: this.trace.snapshotStreamController(),
    });
    await this.options.streamController.handleChunk({ type: 'done' });
    this.trace.logStage('render-done-applied', {
      streamController: this.trace.snapshotStreamController(),
    });
  }

  private handleStreamError(error: unknown): void {
    logger.error('Streaming error:', error);
    this.latestErrorMessage = this.options.host.getFriendlyStreamErrorMessage(
      error instanceof Error ? error.message : 'Unknown error',
    );
    this.trace.logStage('stream-loop-error', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private async renderErrorToStreamController(): Promise<void> {
    if (!this.options.streamController || !this.latestErrorMessage) {
      return;
    }

    await this.options.streamController.handleChunk({
      type: 'error',
      content: this.latestErrorMessage,
    });
    this.options.host.revealStreamingAssistantMessageElement(this.options.preparedSend.tabId);
  }

  private revealStreamingMessageIfNeeded(
    chunk: NonNullable<ReturnType<StreamChunkRouterHost['convertToStreamingChunk']>>,
  ): void {
    if (chunk.type !== 'error' && !hasVisibleStreamingContent(chunk)) {
      return;
    }

    this.options.host.revealStreamingAssistantMessageElement(this.options.preparedSend.tabId);
  }

  private clearPendingIndicatorOnFirstVisibleContent(
    chunk: NonNullable<ReturnType<StreamChunkRouterHost['convertToStreamingChunk']>>,
  ): void {
    if (this.receivedFirstVisibleContent || !hasVisibleStreamingContent(chunk)) {
      return;
    }

    this.receivedFirstVisibleContent = true;
    this.pendingIndicator.clear(false);
    this.trace.logStage('pending-indicator-cleared', {
      reason: 'first-content',
    });
  }

  private scheduleStreamTimeout(): void {
    this.clearStreamTimeout();
    const timeoutMs = this.receivedMeaningfulChunk
      ? STREAM_IDLE_TIMEOUT_MS
      : STREAM_NO_VISIBLE_CONTENT_TIMEOUT_MS;
    this.timeoutId = window.setTimeout(() => {
      if (!this.options.runtime.isStreaming) {
        return;
      }

      this.streamTimedOut = true;
      this.streamInterrupted = true;
      logger.warn('Stream idle timeout reached, detaching local stream and continuing background sync', {
        conversationId: this.options.preparedSend.conversation.id,
        sessionId: getConversationBackendSessionId(this.options.preparedSend.conversation),
        timeoutMs,
        timeoutReason: this.receivedMeaningfulChunk ? 'idle-after-content' : 'no-visible-content',
        hasVisibleAssistantContent: Boolean(this.options.streamController?.getContentBlocks().length),
      });

      this.options.streamController?.cancelStream();
      this.options.host.detachStream(getConversationBackendSessionId(this.options.preparedSend.conversation));
      this.resetStreamingState();
    }, timeoutMs);
  }

  private clearStreamTimeout(): void {
    if (!this.timeoutId) {
      return;
    }

    window.clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  private resetStreamingState(): void {
    this.clearStreamTimeout();
    this.options.runtime.isStreaming = false;
    this.options.host.syncTabStreamLikeState(this.options.preparedSend.tabId);
  }

  private getTraceState(): SendPipelineTraceState {
    return {
      streamCompleted: this.streamCompleted,
      streamInterrupted: this.streamInterrupted,
      streamTimedOut: this.streamTimedOut,
      latestErrorMessage: this.latestErrorMessage,
      finalizedAssistantMetadata: this.finalizedAssistantMetadata,
      finalizedBackendSessionId: this.finalizedAssistantMetadata?.sessionId ?? null,
    };
  }
}
