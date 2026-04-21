import {
  createLogger,
  isInternalStructuredOutputTool,
  resolveToolExecutionStatus,
  resolveToolResultText,
} from '../../shared';
import type { StreamChunk } from '../types';
import { OpenCodeMessageNormalizationMapper } from './OpenCodeMessageNormalizationMapper';
import type { Message, Part } from './OpenCodeSessionLifecycleCoordinator';
import type {
  OpenCodeSSEEvent,
  OpenCodeStreamEvent,
  OpenCodeStreamEventOutcome,
  OpenCodeStreamEventState,
  OpenCodeStreamMutation,
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
  processedToolIds: Set<string>;
  reasoningTextSnapshots: Map<string, string>;
  toolInputSnapshots: Map<string, string>;
}

interface OpenCodeStreamingAssistantTail {
  assistantError: string | null;
  info: Message;
  messageCount: number;
  modelId?: string;
  parts: Part[];
}

interface OpenCodeStreamingAssistantTailLookupOptions {
  promptMessageId?: string;
}

interface OpenCodeStreamingFinalizationOutcome {
  assistantMessageId: string | null;
  chunks: StreamChunk[];
  finalContent: string;
}

interface OpenCodeStreamingRuntimeAbortRequest {
  sessionId?: string | null;
  missingSessionMessage: string;
  missingContextMessage: (sessionId: string) => string;
  startMessage: (sessionId: string) => string;
  completionMessage: string;
  abortFollowUp?: (sessionId: string) => void;
}

export interface OpenCodeStreamingRuntimeEventTransformer {
  handleStreamingEvent(
    eventData: OpenCodeStreamEvent,
    sessionId: string,
    state: OpenCodeStreamEventState,
    streamContext: OpenCodeStreamingRuntimeContext,
  ): OpenCodeStreamEventOutcome;
  parseSSEEventPayload(event: OpenCodeSSEEvent): OpenCodeStreamEvent | null;
  parseSSEEvents(buffer: string): { events: OpenCodeSSEEvent[]; remaining: string };
}

export interface OpenCodeStreamingRuntimeCoordinatorHost {
  applyStreamMutations(mutations: OpenCodeStreamMutation[]): void;
  abortSessionOnServer(sessionId: string): Promise<void> | void;
  delay(ms: number, signal?: AbortSignal): Promise<void>;
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
  promptMessageId?: string;
  startPrompt?: () => Promise<void>;
}

export interface OpenCodeStreamingSdkStreamRequest {
  sessionId: string;
  promptMessageId?: string;
  startPrompt: () => Promise<void>;
  subscribe: (signal: AbortSignal) => Promise<AsyncIterable<SdkEvent>>;
}

export interface OpenCodeStreamingRuntimeRequest {
  sessionId: string;
  promptMessageId?: string;
  useSdkStream: boolean;
  sdk: Omit<OpenCodeStreamingSdkStreamRequest, 'sessionId'>;
  legacy: Omit<OpenCodeStreamingLegacyStreamRequest, 'sessionId'>;
}

type StreamingState = OpenCodeStreamEventState;

const ASSISTANT_TAIL_LOOKUP_MAX_ATTEMPTS = 2;
const ASSISTANT_TAIL_LOOKUP_RETRY_DELAY_MS = 75;

function resolveReasoningDurationSeconds(
  part: Pick<Part, 'time'> & { duration?: unknown },
): number | undefined {
  const start = part.time?.start;
  const end = part.time?.end;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return Math.max(0, end - start) / 1000;
  }

  if (typeof part.duration === 'number' && part.duration > 0) {
    return part.duration;
  }

  return undefined;
}

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
  private readonly partMessageIdMap = new Map<string, string>();

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

  setPartMessageId(partId: string, messageId: string): void {
    if (!partId || !messageId) {
      return;
    }

    this.partMessageIdMap.set(partId, messageId);
  }

  getPartType(partId: string): string | undefined {
    return this.partTypeMap.get(partId);
  }

  getPartMessageId(partId: string): string | undefined {
    return this.partMessageIdMap.get(partId);
  }
}

export class OpenCodeStreamingRuntimeCoordinator {
  private readonly activeStreams = new Map<string, OpenCodeStreamingRuntimeContext>();

  constructor(private readonly host: OpenCodeStreamingRuntimeCoordinatorHost) {}

  async *streamResponse(
    request: OpenCodeStreamingRuntimeRequest,
  ): AsyncGenerator<StreamChunk> {
    if (request.useSdkStream) {
      yield* this.streamSdkResponse({
        sessionId: request.sessionId,
        promptMessageId: request.promptMessageId,
        ...request.sdk,
      });
      return;
    }

    yield* this.streamLegacyResponse({
      sessionId: request.sessionId,
      promptMessageId: request.promptMessageId,
      ...request.legacy,
    });
  }

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

  dispose(): void {
    const activeContexts = [...this.activeStreams.values()];
    if (activeContexts.length === 0) {
      return;
    }

    logger.debug(`Disposing ${activeContexts.length} active stream context(s)`);
    this.activeStreams.clear();
    for (const streamContext of activeContexts) {
      this.abortActiveStreamContext(streamContext, {
        startMessage: (sessionId) => `Disposing local stream context for session ${sessionId}...`,
        completionMessage: 'Local stream disposal signal sent',
      });
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
        yield* this.consumeLegacyEventStream(
          request.sessionId,
          streamContext,
          request.promptMessageId,
        );
      } finally {
        this.finalizeActiveStreamContext(
          streamContext,
          `Legacy stream ended for session ${request.sessionId}`,
        );
      }
    } catch (error) {
      yield this.buildErrorChunk(error);
    }
  }

  async *streamSdkResponse(
    request: OpenCodeStreamingSdkStreamRequest,
  ): AsyncGenerator<StreamChunk> {
    const streamContext = this.createActiveStreamContext(request.sessionId);
    const state = this.createStreamingState();
    let yieldedMessageStart = false;

    try {
      let stream: AsyncIterable<SdkEvent>;
      try {
        stream = await request.subscribe(streamContext.signal);
      } catch (error) {
        this.host.logServiceWarning(
          'session.event-stream',
          'SDK event stream failed before prompt start, falling back to legacy SSE',
          error,
        );
        yield { type: 'message_start' };
        yieldedMessageStart = true;
        await request.startPrompt();
        yield* this.consumeLegacyEventStream(request.sessionId, streamContext, request.promptMessageId);
        return;
      }

      try {
        await request.startPrompt();
      } catch (error) {
        yield this.buildErrorChunk(error);
        return;
      }

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
        if (outcome.mutations.length > 0) {
          this.host.applyStreamMutations(outcome.mutations);
        }
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
      yield* this.finishStreamingResponse(
        request.sessionId,
        state,
        request.promptMessageId,
      );
    } catch (error) {
      yield this.buildErrorChunk(error);
    } finally {
      this.finalizeActiveStreamContext(
        streamContext,
        `SDK stream ended for session ${request.sessionId}`,
      );
    }
  }

  cancelStream(sessionId?: string | null): void {
    this.controlActiveStream({
      sessionId,
      missingSessionMessage: 'No session specified for stream cancellation',
      missingContextMessage: (targetSessionId) =>
        `No active stream to cancel for session ${targetSessionId}`,
      startMessage: (targetSessionId) => `Cancelling stream for session ${targetSessionId}...`,
      completionMessage: 'Abort signal sent',
      abortFollowUp: (targetSessionId) => {
        void this.host.abortSessionOnServer(targetSessionId);
      },
    });
  }

  detachStream(sessionId?: string | null): void {
    this.controlActiveStream({
      sessionId,
      missingSessionMessage: 'No session specified for local stream detach',
      missingContextMessage: (targetSessionId) =>
        `No active stream to detach for session ${targetSessionId}`,
      startMessage: (targetSessionId) =>
        `Detaching local stream listener for session ${targetSessionId}...`,
      completionMessage: 'Local stream detach signal sent',
    });
  }

  private createStreamingState(): StreamingState {
    return {
      lastContent: '',
      lastErrorMessage: null,
      processedToolIds: new Set<string>(),
      toolInputSnapshots: new Map(),
      reasoningTextSnapshots: new Map(),
      debugChunkSequence: 0,
      lastTextDelta: null,
    };
  }

  private async *consumeLegacyEventStream(
    sessionId: string,
    streamContext: OpenCodeStreamingRuntimeContext,
    promptMessageId?: string,
  ): AsyncGenerator<StreamChunk> {
    const signal = streamContext.signal;
    const eventStream = this.connectSSE(signal);
    const state = this.createStreamingState();

    for await (const event of eventStream) {
      if (signal?.aborted) {
        logger.debug('Stream aborted, breaking loop');
        break;
      }

      const eventData = this.host.streamEventTransformer.parseSSEEventPayload(event);
      if (!eventData) {
        continue;
      }

      const outcome = this.host.streamEventTransformer.handleStreamingEvent(
        eventData,
        sessionId,
        state,
        streamContext,
      );
      if (outcome.mutations.length > 0) {
        this.host.applyStreamMutations(outcome.mutations);
      }
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
    yield* this.finishStreamingResponse(
      sessionId,
      state,
      promptMessageId,
    );
  }

  private async *finishStreamingResponse(
    sessionId: string,
    state: StreamingState,
    promptMessageId?: string,
  ): AsyncGenerator<StreamChunk> {
    const outcome = await this.buildFinalizationOutcome(
      sessionId,
      state,
      promptMessageId,
    );
    yield* outcome.chunks;
    this.logFinalizationStop(sessionId, outcome.assistantMessageId, outcome.finalContent);
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

  private finalizeActiveStreamContext(
    streamContext: OpenCodeStreamingRuntimeContext,
    completionMessage: string,
  ): void {
    this.releaseActiveStreamContext(streamContext);
    logger.debug(completionMessage);
  }

  private controlActiveStream(request: OpenCodeStreamingRuntimeAbortRequest): void {
    const streamContext = this.resolveActiveStreamContext(
      request.sessionId,
      request.missingSessionMessage,
      request.missingContextMessage,
    );
    if (!streamContext) {
      return;
    }

    this.abortActiveStreamContext(streamContext, request);
  }

  private resolveActiveStreamContext(
    sessionId: string | null | undefined,
    missingSessionMessage: string,
    missingContextMessage: (sessionId: string) => string,
  ): OpenCodeStreamingRuntimeContext | null {
    const targetSessionId = this.normalizeSessionId(sessionId);
    if (!targetSessionId) {
      logger.debug(missingSessionMessage);
      return null;
    }

    const streamContext = this.activeStreams.get(targetSessionId);
    if (!streamContext) {
      logger.debug(missingContextMessage(targetSessionId));
      return null;
    }

    return streamContext;
  }

  private abortActiveStreamContext(
    streamContext: OpenCodeStreamingRuntimeContext,
    request: Pick<
      OpenCodeStreamingRuntimeAbortRequest,
      'startMessage' | 'completionMessage' | 'abortFollowUp'
    >,
  ): void {
    logger.debug(request.startMessage(streamContext.sessionId));
    streamContext.abort();
    logger.debug(request.completionMessage);
    request.abortFollowUp?.(streamContext.sessionId);
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

  private async buildFinalizationOutcome(
    sessionId: string,
    state: StreamingState,
    promptMessageId?: string,
  ): Promise<OpenCodeStreamingFinalizationOutcome> {
    const cursor = this.createFinalizationCursor(state);

    this.logFinalizationStart(sessionId, cursor);

    const assistantTail = await this.loadAssistantTail(sessionId, {
      promptMessageId,
    });
    if (!assistantTail) {
      return {
        assistantMessageId: null,
        chunks: [],
        finalContent: cursor.lastContent,
      };
    }

    return {
      assistantMessageId: assistantTail.info.id,
      chunks: this.buildAssistantFinalizationChunks(sessionId, assistantTail, cursor),
      finalContent: cursor.lastContent,
    };
  }

  private async loadAssistantTail(
    sessionId: string,
    options: OpenCodeStreamingAssistantTailLookupOptions = {},
    attempt = 1,
  ): Promise<OpenCodeStreamingAssistantTail | null> {
    try {
      const messages = await this.host.getSessionMessages(sessionId);
      const assistantMessage = this.findLatestAssistantMessage(messages, options.promptMessageId);
      if (!assistantMessage) {
        if (
          options.promptMessageId
          && attempt < ASSISTANT_TAIL_LOOKUP_MAX_ATTEMPTS
        ) {
          logAssistantFinalizationDebug('service-finish-retrying-assistant-tail', {
            sessionId,
            promptMessageId: options.promptMessageId,
            attempt,
            nextAttempt: attempt + 1,
            delayMs: ASSISTANT_TAIL_LOOKUP_RETRY_DELAY_MS,
            messageCount: messages.length,
            roles: messages.map((item) => item.info.role),
          });
          await this.host.delay(ASSISTANT_TAIL_LOOKUP_RETRY_DELAY_MS);
          return this.loadAssistantTail(sessionId, options, attempt + 1);
        }

        logger.warn('No assistant message found for current prompt when finalizing stream response', {
          sessionId,
          promptMessageId: options.promptMessageId ?? null,
          messageCount: messages.length,
          roles: messages.map((item) => item.info.role),
          lastUserId: messages.filter((item) => item.info.role === 'user').at(-1)?.info.id ?? null,
          lastAssistantId: messages.filter((item) => item.info.role === 'assistant').at(-1)?.info.id ?? null,
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
    promptMessageId?: string,
  ): { info: Message; parts: Part[] } | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (!candidate || candidate.info.role !== 'assistant') {
        continue;
      }

      if (promptMessageId) {
        const parentId = typeof (candidate.info as Message & { parentID?: unknown }).parentID === 'string'
          ? (candidate.info as Message & { parentID?: string }).parentID
          : null;
        if (parentId !== promptMessageId) {
          continue;
        }
      }

      return candidate;
    }

    return null;
  }

  private buildAssistantFinalizationChunks(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    const errorChunk = this.buildAssistantErrorChunk(sessionId, assistantTail, cursor);
    if (errorChunk) {
      chunks.push(errorChunk);
    }

    chunks.push(...this.collectAssistantTrailingContentChunks(sessionId, assistantTail, cursor));
    chunks.push(this.buildAssistantMetadataChunk(sessionId, assistantTail, cursor.lastContent.length));
    return chunks;
  }

  private createFinalizationCursor(
    state: StreamingState,
  ): OpenCodeStreamingFinalizationCursor {
    return {
      lastContent: state.lastContent,
      priorErrorMessage: state.lastErrorMessage,
      processedToolIds: new Set(state.processedToolIds),
      reasoningTextSnapshots: new Map(state.reasoningTextSnapshots),
      toolInputSnapshots: new Map(state.toolInputSnapshots),
    };
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

  private buildAssistantErrorChunk(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk | null {
    if (!this.shouldEmitAssistantError(assistantTail, cursor)) {
      return null;
    }

    logAssistantFinalizationDebug('service-finish-emitting-assistant-error', {
      sessionId,
      assistantMessageId: assistantTail.info.id,
      assistantError: assistantTail.assistantError,
    });
    cursor.priorErrorMessage = assistantTail.assistantError;
    return {
      type: 'error',
      content: assistantTail.assistantError ?? '',
    };
  }

  private collectAssistantTrailingContentChunks(
    sessionId: string,
    assistantTail: OpenCodeStreamingAssistantTail,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    for (const part of assistantTail.parts) {
      if (this.isTextPartWithText(part)) {
        chunks.push(...this.collectAssistantTrailingTextChunks(sessionId, assistantTail.info.id, part, cursor));
        continue;
      }

      if (part.type === 'reasoning' || part.type === 'thinking') {
        chunks.push(...this.collectAssistantTrailingReasoningChunks(sessionId, assistantTail.info.id, part, cursor));
        continue;
      }

      if (part.type === 'tool') {
        chunks.push(...this.collectAssistantTrailingToolChunks(sessionId, assistantTail.info.id, part, cursor));
      }
    }

    return chunks;
  }

  private isTextPartWithText(part: Part): part is Part & { text: string } {
    return part.type === 'text' && typeof part.text === 'string';
  }

  private collectAssistantTrailingTextChunks(
    sessionId: string,
    assistantMessageId: string,
    part: Part & { text: string },
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk[] {
    const currentText = part.text;
    if (currentText.length <= cursor.lastContent.length) {
      return [];
    }

    const delta = currentText.slice(cursor.lastContent.length);
    logAssistantFinalizationDebug('service-finish-emitting-trailing-text', {
      sessionId,
      assistantMessageId,
      partId: part.id,
      deltaLength: delta.length,
      previousLength: cursor.lastContent.length,
      nextLength: currentText.length,
      deltaPreview: getDebugTextPreview(delta, 120),
    });
    cursor.lastContent = currentText;
    return [{ type: 'text', content: delta }];
  }

  private collectAssistantTrailingReasoningChunks(
    sessionId: string,
    assistantMessageId: string,
    part: Part,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk[] {
    if (typeof part.text !== 'string') {
      return [];
    }

    const previousText = cursor.reasoningTextSnapshots.get(part.id) ?? '';
    const nextText = part.text;
    const delta = nextText.startsWith(previousText)
      ? nextText.slice(previousText.length)
      : nextText;
    cursor.reasoningTextSnapshots.set(part.id, nextText);

    const durationSeconds = resolveReasoningDurationSeconds(part);
    if (this.hasVisibleReasoningText(delta)) {
      logAssistantFinalizationDebug('service-finish-emitting-trailing-reasoning', {
        sessionId,
        assistantMessageId,
        partId: part.id,
        deltaLength: delta.length,
        durationSeconds: durationSeconds ?? null,
        deltaPreview: getDebugTextPreview(delta, 120),
      });
      return [{
        type: 'thinking',
        content: delta,
        partId: part.id,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      }];
    }

    if (
      durationSeconds !== undefined
      && this.hasVisibleReasoningText(nextText)
    ) {
      return [{
        type: 'thinking',
        content: '',
        partId: part.id,
        durationSeconds,
      }];
    }

    return [];
  }

  private collectAssistantTrailingToolChunks(
    sessionId: string,
    assistantMessageId: string,
    part: Part,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): StreamChunk[] {
    const toolName = typeof part.tool === 'string' ? part.tool : 'unknown';
    if (isInternalStructuredOutputTool(toolName)) {
      return [];
    }

    const toolId = typeof part.callID === 'string' && part.callID.trim()
      ? part.callID
      : part.id;
    if (!toolId) {
      return [];
    }

    const toolInput = this.normalizeToolInput(part.state);
    const toolMetadata = this.normalizeToolMetadata(part.state);
    const toolResultVisibility = this.resolveToolResultVisibility(toolName);
    const nextSnapshot = this.getToolInputSnapshot(toolInput);
    const previousSnapshot = cursor.toolInputSnapshots.get(toolId);
    const shouldEmitToolUse = !cursor.processedToolIds.has(toolId) || nextSnapshot !== previousSnapshot;

    const chunks: StreamChunk[] = [];
    if (shouldEmitToolUse) {
      logAssistantFinalizationDebug('service-finish-emitting-trailing-tool-use', {
        sessionId,
        assistantMessageId,
        partId: part.id,
        toolId,
        toolName,
        inputSnapshot: nextSnapshot,
      });
      cursor.processedToolIds.add(toolId);
      cursor.toolInputSnapshots.set(toolId, nextSnapshot);
      chunks.push({
        type: 'tool_use',
        id: toolId,
        name: toolName,
        input: toolInput,
        ...(toolMetadata ? { toolMetadata } : {}),
        ...(toolResultVisibility ? { toolResultVisibility } : {}),
      });
    }

    const toolStatus = resolveToolExecutionStatus({
      toolName,
      state: part.state as never,
    });
    const toolResult = resolveToolResultText(part.state as never);
    const resultKey = `${toolId}_result`;
    if (
      (toolStatus === 'completed' || toolStatus === 'error')
      && toolResult !== undefined
      && !cursor.processedToolIds.has(resultKey)
    ) {
      logAssistantFinalizationDebug('service-finish-emitting-trailing-tool-result', {
        sessionId,
        assistantMessageId,
        partId: part.id,
        toolId,
        toolName,
        toolStatus,
        resultLength: toolResult.length,
      });
      cursor.processedToolIds.add(resultKey);
      chunks.push({
        type: 'tool_result',
        toolUseId: toolId,
        content: toolResult,
        isError: toolStatus === 'error',
      });
    }

    return chunks;
  }

  private normalizeToolInput(state: Part['state']): Record<string, unknown> {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return {};
    }

    const input = (state as { input?: unknown }).input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }

    return input as Record<string, unknown>;
  }

  private normalizeToolMetadata(state: Part['state']): Record<string, unknown> | undefined {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return undefined;
    }

    const metadata = (state as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const sessionId = typeof (metadata as { sessionId?: unknown }).sessionId === 'string'
      ? (metadata as { sessionId: string }).sessionId.trim()
      : '';
    if (!sessionId) {
      return undefined;
    }

    return { sessionId };
  }

  private resolveToolResultVisibility(toolName: string): 'hidden' | undefined {
    return toolName === 'task' ? 'hidden' : undefined;
  }

  private getToolInputSnapshot(input: Record<string, unknown>): string {
    if (Object.keys(input).length === 0) {
      return '';
    }

    try {
      return JSON.stringify(input);
    } catch {
      return '[unserializable-tool-input]';
    }
  }

  private hasVisibleReasoningText(text: unknown): text is string {
    return typeof text === 'string' && text.trim().length > 0;
  }

  private logFinalizationStart(
    sessionId: string,
    cursor: OpenCodeStreamingFinalizationCursor,
  ): void {
    logAssistantFinalizationDebug('service-finish-start', {
      sessionId,
      lastContentLength: cursor.lastContent.length,
      lastContentPreview: getDebugTextPreview(cursor.lastContent, 120),
      priorErrorMessage: cursor.priorErrorMessage,
    });
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
