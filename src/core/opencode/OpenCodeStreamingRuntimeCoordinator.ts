import { createLogger } from '../../shared';
import type { StreamChunk } from '../types';
import { OpenCodeMessageNormalizationMapper } from './OpenCodeMessageNormalizationMapper';
import type { Message, Part } from './OpenCodeSessionLifecycleCoordinator';
import type {
  OpenCodeSSEEvent,
  OpenCodeStreamEvent,
  OpenCodeStreamEventState,
} from './OpenCodeStreamEventTransformer';
import type { SdkEvent } from './sdkTypes';

const logger = createLogger('OpenCodeStreamingRuntimeCoordinator');

interface OpenCodeSseReadState {
  aborted: boolean;
  buffer: string;
}

interface OpenCodeSseStreamContext {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  signal?: AbortSignal;
  state: OpenCodeSseReadState;
  abortHandler: () => void;
}

interface OpenCodeStreamingAssistantSummary {
  totalParts: number;
  textPartCount: number;
  textLength: number;
  toolPartCount: number;
  reasoningPartCount: number;
  filePartCount: number;
}

interface OpenCodeStreamingFinalizationCursor {
  lastContent: string;
  priorErrorMessage: string | null;
}

interface OpenCodeStreamingAssistantTail {
  assistantError: string | null;
  info: Message;
  messageCount: number;
  modelId?: string;
  parts: Part[];
}

export interface OpenCodeStreamingRuntimeEventTransformer {
  handleStreamingEvent(
    eventData: OpenCodeStreamEvent,
    sessionId: string,
    state: OpenCodeStreamEventState,
    streamContext: OpenCodeStreamingRuntimeContext,
  ): { chunks: StreamChunk[]; stop: boolean };
  parseSSEEvents(buffer: string): { events: OpenCodeSSEEvent[]; remaining: string };
}

export interface OpenCodeStreamingRuntimeCoordinatorHost {
  abortSessionOnServer(sessionId: string): Promise<void> | void;
  getLegacyEventStreamRequest(): {
    url: string;
    headers: Record<string, string>;
  };
  getSessionMessages(sessionId: string): Promise<Array<{ info: Message; parts: Part[] }>>;
  logServiceWarning(key: string, message: string, error: unknown): void;
  streamEventTransformer: OpenCodeStreamingRuntimeEventTransformer;
}

export interface OpenCodeStreamingLegacyStreamRequest {
  sessionId: string;
  startPrompt?: () => Promise<void>;
}

export interface OpenCodeStreamingSdkStreamRequest {
  sessionId: string;
  startPrompt: () => Promise<void>;
  subscribe: (signal: AbortSignal) => Promise<AsyncIterable<SdkEvent>>;
}

type StreamingState = OpenCodeStreamEventState;

function getDebugTextPreview(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function stringifyDebugPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable]';
  }
}

function logAssistantFinalizationDebug(label: string, payload: unknown): void {
  logger.debug(`Assistant stream finalization [${label}]: ${stringifyDebugPayload(payload)}`);
}

function summarizeAssistantParts(parts: Part[]): OpenCodeStreamingAssistantSummary {
  let textPartCount = 0;
  let textLength = 0;
  let toolPartCount = 0;
  let reasoningPartCount = 0;
  let filePartCount = 0;

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      textPartCount += 1;
      textLength += part.text.length;
    } else if (part.type === 'tool') {
      toolPartCount += 1;
    } else if (part.type === 'reasoning' || part.type === 'thinking') {
      reasoningPartCount += 1;
    } else if (part.type === 'file') {
      filePartCount += 1;
    }
  }

  return {
    totalParts: parts.length,
    textPartCount,
    textLength,
    toolPartCount,
    reasoningPartCount,
    filePartCount,
  };
}

function extractStructuredErrorMessage(errorLike: unknown): string | null {
  if (!errorLike || typeof errorLike !== 'object') {
    return null;
  }

  const errorRecord = errorLike as {
    message?: unknown;
    data?: {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
    };
    name?: unknown;
  };

  const baseMessage = typeof errorRecord.data?.message === 'string' && errorRecord.data.message.trim()
    ? errorRecord.data.message.trim()
    : typeof errorRecord.message === 'string' && errorRecord.message.trim()
      ? errorRecord.message.trim()
      : typeof errorRecord.name === 'string' && errorRecord.name.trim()
        ? errorRecord.name.trim()
        : null;

  if (!baseMessage) {
    return null;
  }

  const statusCode = typeof errorRecord.data?.statusCode === 'number'
    ? errorRecord.data.statusCode
    : null;

  if (statusCode === null || baseMessage.toLowerCase().includes(`http ${statusCode}`)) {
    return baseMessage;
  }

  return `${baseMessage} (HTTP ${statusCode})`;
}

export class OpenCodeStreamingRuntimeContext {
  readonly sessionId: string;
  private readonly abortController = new AbortController();
  private readonly partTypeMap = new Map<string, string>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  abort(): void {
    this.abortController.abort();
  }

  hasPartType(partId: string): boolean {
    return this.partTypeMap.has(partId);
  }

  setPartType(partId: string, partType: string): void {
    if (!partId || !partType) {
      return;
    }

    this.partTypeMap.set(partId, partType);
  }

  getPartType(partId: string): string | undefined {
    return this.partTypeMap.get(partId);
  }
}

export class OpenCodeStreamingRuntimeCoordinator {
  private readonly activeStreams = new Map<string, OpenCodeStreamingRuntimeContext>();

  constructor(private readonly host: OpenCodeStreamingRuntimeCoordinatorHost) {}

  createActiveStreamContext(sessionId: string): OpenCodeStreamingRuntimeContext {
    const existing = this.activeStreams.get(sessionId);
    if (existing) {
      logger.warn(`Replacing existing active stream context for session ${sessionId}`);
      existing.abort();
    }

    const context = new OpenCodeStreamingRuntimeContext(sessionId);
    this.activeStreams.set(sessionId, context);
    return context;
  }

  releaseActiveStreamContext(streamContext: OpenCodeStreamingRuntimeContext): void {
    const current = this.activeStreams.get(streamContext.sessionId);
    if (current === streamContext) {
      this.activeStreams.delete(streamContext.sessionId);
    }
  }

  async *streamLegacyResponse(
    request: OpenCodeStreamingLegacyStreamRequest,
  ): AsyncGenerator<StreamChunk> {
    try {
      await request.startPrompt?.();

      const streamContext = this.createActiveStreamContext(request.sessionId);
      yield { type: 'message_start' };
      try {
        yield* this.consumeLegacyEventStream(request.sessionId, streamContext);
      } finally {
        this.releaseActiveStreamContext(streamContext);
        logger.debug(`Legacy stream ended for session ${request.sessionId}`);
      }
    } catch (error) {
      yield this.buildErrorChunk(error);
    }
  }

  async *streamSdkResponse(
    request: OpenCodeStreamingSdkStreamRequest,
  ): AsyncGenerator<StreamChunk> {
    try {
      await request.startPrompt();
    } catch (error) {
      yield this.buildErrorChunk(error);
      return;
    }

    const streamContext = this.createActiveStreamContext(request.sessionId);
    const state = this.createStreamingState();
    let yieldedMessageStart = false;

    try {
      const stream = await request.subscribe(streamContext.signal);
      const iterator = stream[Symbol.asyncIterator]();

      while (true) {
        let result: IteratorResult<SdkEvent>;
        try {
          result = await iterator.next() as IteratorResult<SdkEvent>;
        } catch (error) {
          if (!yieldedMessageStart) {
            this.host.logServiceWarning(
              'session.event-stream',
              'SDK event stream failed before first event, falling back to legacy SSE',
              error,
            );
            yield { type: 'message_start' };
            yieldedMessageStart = true;
            yield* this.consumeLegacyEventStream(request.sessionId, streamContext);
            return;
          }

          throw error;
        }

        if (result.done) {
          break;
        }

        if (!yieldedMessageStart) {
          yield { type: 'message_start' };
          yieldedMessageStart = true;
        }

        const outcome = this.host.streamEventTransformer.handleStreamingEvent(
          result.value as unknown as OpenCodeStreamEvent,
          request.sessionId,
          state,
          streamContext,
        );
        for (const chunk of outcome.chunks) {
          yield chunk;
        }

        if (outcome.stop) {
          streamContext.abort();
          break;
        }
      }

      if (!yieldedMessageStart) {
        yield { type: 'message_start' };
      }

      logAssistantFinalizationDebug('service-sdk-event-stream-ended', {
        sessionId: request.sessionId,
        accumulatedTextLength: state.lastContent.length,
        lastTextDelta: state.lastTextDelta,
      });
      yield* this.finishStreamingResponse(request.sessionId, state.lastContent, state.lastErrorMessage);
    } catch (error) {
      yield this.buildErrorChunk(error);
    } finally {
      this.releaseActiveStreamContext(streamContext);
      logger.debug(`SDK stream ended for session ${request.sessionId}`);
    }
  }

  cancelStream(sessionId?: string | null): void {
    const targetSessionId = this.normalizeSessionId(sessionId);
    if (!targetSessionId) {
      logger.debug('No session specified for stream cancellation');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to cancel for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Cancelling stream for session ${targetSessionId}...`);
    streamContext.abort();
    logger.debug('Abort signal sent');
    void this.host.abortSessionOnServer(targetSessionId);
  }

  detachStream(sessionId?: string | null): void {
    const targetSessionId = this.normalizeSessionId(sessionId);
    if (!targetSessionId) {
      logger.debug('No session specified for local stream detach');
      return;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(`No active stream to detach for session ${targetSessionId}`);
      return;
    }

    logger.debug(`Detaching local stream listener for session ${targetSessionId}...`);
    streamContext.abort();
    logger.debug('Local stream detach signal sent');
  }

  private createStreamingState(): StreamingState {
    return {
      lastContent: '',
      lastErrorMessage: null,
      processedToolIds: new Set<string>(),
      toolInputSnapshots: new Map(),
      debugChunkSequence: 0,
      lastTextDelta: null,
    };
  }

  private async *consumeLegacyEventStream(
    sessionId: string,
    streamContext: OpenCodeStreamingRuntimeContext,
  ): AsyncGenerator<StreamChunk> {
    const signal = streamContext.signal;
    const eventStream = this.connectSSE(signal);
    const state = this.createStreamingState();

    for await (const event of eventStream) {
      if (signal?.aborted) {
        logger.debug('Stream aborted, breaking loop');
        break;
      }

      let eventData: OpenCodeStreamEvent;
      try {
        eventData = JSON.parse(event.data) as OpenCodeStreamEvent;
      } catch {
        continue;
      }

      const outcome = this.host.streamEventTransformer.handleStreamingEvent(
        eventData,
        sessionId,
        state,
        streamContext,
      );
      for (const chunk of outcome.chunks) {
        yield chunk;
      }

      if (outcome.stop) {
        streamContext.abort();
        break;
      }
    }

    logAssistantFinalizationDebug('service-legacy-event-stream-ended', {
      sessionId,
      accumulatedTextLength: state.lastContent.length,
      lastTextDelta: state.lastTextDelta,
    });
    yield* this.finishStreamingResponse(sessionId, state.lastContent, state.lastErrorMessage);
  }

  private async *finishStreamingResponse(
    sessionId: string,
    lastContent: string,
    priorErrorMessage: string | null = null,
  ): AsyncGenerator<StreamChunk> {
    const cursor: OpenCodeStreamingFinalizationCursor = {
      lastContent,
      priorErrorMessage,
    };

    logAssistantFinalizationDebug('service-finish-start', {
      sessionId,
      lastContentLength: cursor.lastContent.length,
      lastContentPreview: getDebugTextPreview(cursor.lastContent, 120),
      priorErrorMessage: cursor.priorErrorMessage,
    });

    const assistantTail = await this.loadAssistantTail(sessionId);
    if (assistantTail) {
      yield* this.emitAssistantFinalization(sessionId, assistantTail, cursor);
    }

    this.logFinalizationStop(sessionId, assistantTail?.info.id ?? null, cursor.lastContent);
    yield { type: 'message_stop' };
  }

  private buildErrorChunk(error: unknown): StreamChunk {
    return {
      type: 'error',
      content: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  private async *connectSSE(signal?: AbortSignal): AsyncGenerator<OpenCodeSSEEvent> {
    const context = await this.createSseStreamContext(signal);
    if (!context) {
      return;
    }

    try {
      yield* this.readSseStream(context);
    } catch (error) {
      if (this.isAbortedSseRead(error, context)) {
        return;
      }
      throw error;
    } finally {
      this.disposeSseStreamContext(context);
    }
  }

  private async createSseStreamContext(
    signal?: AbortSignal,
  ): Promise<OpenCodeSseStreamContext | null> {
    if (signal?.aborted) {
      return null;
    }

    const reader = await this.openSseReader(signal);
    const state: OpenCodeSseReadState = {
      aborted: false,
      buffer: '',
    };
    const abortHandler = this.createSseAbortHandler(reader, state);
    signal?.addEventListener('abort', abortHandler);

    return {
      reader,
      decoder: new TextDecoder(),
      signal,
      state,
      abortHandler,
    };
  }

  private disposeSseStreamContext(context: OpenCodeSseStreamContext): void {
    context.signal?.removeEventListener('abort', context.abortHandler);
    context.reader.releaseLock();
  }

  private async openSseReader(
    signal?: AbortSignal,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const request = this.host.getLegacyEventStreamRequest();
    const response = await fetch(request.url, {
      method: 'GET',
      headers: request.headers,
      signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    return response.body.getReader();
  }

  private createSseAbortHandler(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    state: OpenCodeSseReadState,
  ): () => void {
    return () => {
      state.aborted = true;
      void reader.cancel();
    };
  }

  private async *readSseStream(context: OpenCodeSseStreamContext): AsyncGenerator<OpenCodeSSEEvent> {
    while (true) {
      const decodedChunk = await this.readNextSseTextChunk(context);
      if (decodedChunk === null) {
        break;
      }

      context.state.buffer += decodedChunk;
      yield* this.emitParsedSseEvents(context.state);
    }

    yield* this.flushRemainingSseEvents(context);
  }

  private async readNextSseTextChunk(
    context: OpenCodeSseStreamContext,
  ): Promise<string | null> {
    if (this.shouldStopSseStream(context)) {
      return null;
    }

    const readResult = await this.readSseChunk(context);
    if (!readResult || readResult.done || this.shouldStopSseStream(context)) {
      return null;
    }

    return context.decoder.decode(readResult.value, { stream: true });
  }

  private async readSseChunk(
    context: Pick<OpenCodeSseStreamContext, 'reader' | 'signal' | 'state'>,
  ): Promise<ReadableStreamReadResult<Uint8Array> | null> {
    try {
      return await context.reader.read();
    } catch (error) {
      if (this.isAbortedSseRead(error, context)) {
        return null;
      }
      throw error;
    }
  }

  private shouldStopSseStream(
    context: Pick<OpenCodeSseStreamContext, 'signal' | 'state'>,
  ): boolean {
    return context.state.aborted || context.signal?.aborted === true;
  }

  private isAbortedSseRead(
    error: unknown,
    context: Pick<OpenCodeSseStreamContext, 'signal' | 'state'>,
  ): boolean {
    return this.shouldStopSseStream(context) || (error instanceof Error && error.name === 'AbortError');
  }

  private *emitParsedSseEvents(state: OpenCodeSseReadState): Generator<OpenCodeSSEEvent, void, void> {
    const events = this.host.streamEventTransformer.parseSSEEvents(state.buffer);
    state.buffer = events.remaining;
    yield* events.events;
  }

  private *emitRemainingSseEvents(buffer: string): Generator<OpenCodeSSEEvent, void, void> {
    const events = this.host.streamEventTransformer.parseSSEEvents(buffer + '\n\n');
    yield* events.events;
  }

  private *flushRemainingSseEvents(
    context: OpenCodeSseStreamContext,
  ): Generator<OpenCodeSSEEvent, void, void> {
    if (!context.state.buffer.trim() || this.shouldStopSseStream(context)) {
      return;
    }

    yield* this.emitRemainingSseEvents(context.state.buffer);
    context.state.buffer = '';
  }

  private async loadAssistantTail(sessionId: string): Promise<OpenCodeStreamingAssistantTail | null> {
    try {
      const messages = await this.host.getSessionMessages(sessionId);
      const assistantMessage = this.findLatestAssistantMessage(messages);
      if (!assistantMessage) {
        logger.warn('No assistant message found when finalizing stream response', {
          sessionId,
          messageCount: messages.length,
          roles: messages.map((item) => item.info.role),
          lastUserId: messages.filter((item) => item.info.role === 'user').at(-1)?.info.id ?? null,
        });
        return null;
      }

      const modelId = OpenCodeMessageNormalizationMapper.formatModelIdentifier(
        assistantMessage.info.providerID,
        assistantMessage.info.modelID,
      );
      const assistantError = extractStructuredErrorMessage(assistantMessage.info.error);

      logAssistantFinalizationDebug('service-finish-loaded-assistant', {
        sessionId,
        messageCount: messages.length,
        assistantMessageId: assistantMessage.info.id,
        messageCreatedAt: assistantMessage.info.time.created,
        modelId: modelId ?? null,
        structuredPresent: assistantMessage.info.structured !== undefined,
        assistantError,
        partSummary: summarizeAssistantParts(assistantMessage.parts),
      });

      return {
        assistantError,
        info: assistantMessage.info,
        messageCount: messages.length,
        modelId,
        parts: assistantMessage.parts,
      };
    } catch (error) {
      logger.error('Final message check failed:', error);
      return null;
    }
  }

  private findLatestAssistantMessage(
    messages: Array<{ info: Message; parts: Part[] }>,
  ): { info: Message; parts: Part[] } | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate && candidate.info.role === 'assistant') {
        return candidate;
      }
    }

    return null;
  }

  private *emitAssistantFinalization(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): Generator<StreamChunk, void, void> {
    if (this.shouldEmitAssistantError(assistantTail, cursor)) {
      logAssistantFinalizationDebug('service-finish-emitting-assistant-error', {
        sessionId,
        assistantMessageId: assistantTail.info.id,
        assistantError: assistantTail.assistantError,
      });
      yield {
        type: 'error',
        content: assistantTail.assistantError ?? '',
      };
      cursor.priorErrorMessage = assistantTail.assistantError;
    }

    yield* this.emitAssistantTrailingText(sessionId, assistantTail, cursor);
    yield this.buildAssistantMetadataChunk(sessionId, assistantTail, cursor.lastContent.length);
  }

  private shouldEmitAssistantError(
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): boolean {
    return Boolean(
      assistantTail.assistantError
        && !cursor.priorErrorMessage
        && !cursor.lastContent.trim(),
    );
  }

  private *emitAssistantTrailingText(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): Generator<StreamChunk, void, void> {
    for (const part of assistantTail.parts) {
      if (part.type !== 'text' || typeof part.text !== 'string') {
        continue;
      }

      const currentText = part.text;
      if (currentText.length <= cursor.lastContent.length) {
        continue;
      }

      const delta = currentText.slice(cursor.lastContent.length);
      logAssistantFinalizationDebug('service-finish-emitting-trailing-text', {
        sessionId,
        assistantMessageId: assistantTail.info.id,
        partId: part.id,
        deltaLength: delta.length,
        previousLength: cursor.lastContent.length,
        nextLength: currentText.length,
        deltaPreview: getDebugTextPreview(delta, 120),
      });
      yield { type: 'text', content: delta };
      cursor.lastContent = currentText;
    }
  }

  private buildAssistantMetadataChunk(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    finalTextLength: number,
  ): StreamChunk {
    logAssistantFinalizationDebug('service-finish-emitting-message-metadata', {
      sessionId,
      assistantMessageId: assistantTail.info.id,
      messageCount: assistantTail.messageCount,
      timestamp: assistantTail.info.time.created,
      modelId: assistantTail.modelId ?? null,
      finalTextLength,
    });

    return {
      type: 'message_metadata',
      messageId: assistantTail.info.id,
      timestamp: assistantTail.info.time.created,
      modelId: assistantTail.modelId,
    };
  }

  private logFinalizationStop(
    sessionId: string,
    assistantMessageId: string | null,
    lastContent: string,
  ): void {
    logAssistantFinalizationDebug('service-finish-emitting-message-stop', {
      sessionId,
      assistantMessageId,
      finalTextLength: lastContent.length,
      finalTextPreview: getDebugTextPreview(lastContent, 120),
    });
  }

  private normalizeSessionId(sessionId?: string | null): string {
    return typeof sessionId === 'string' ? sessionId : '';
  }
}
