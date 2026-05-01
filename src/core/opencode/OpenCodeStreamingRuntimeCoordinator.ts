import { createLogger } from '../../shared';
import type { StreamChunk } from '../types';
import { OpenCodeLegacySseStreamReader } from './OpenCodeLegacySseStreamReader';
import type { Message, Part } from './OpenCodeSessionLifecycleCoordinator';
import type {
  OpenCodeSSEEvent,
  OpenCodeStreamEvent,
  OpenCodeStreamEventOutcome,
  OpenCodeStreamEventState,
  OpenCodeStreamMutation,
} from './OpenCodeStreamEventTransformer';
import { OpenCodeStreamingFinalizationCoordinator } from './OpenCodeStreamingFinalizationCoordinator';
import type { SdkEvent } from './sdkTypes';

const logger = createLogger('OpenCodeStreamingRuntimeCoordinator');

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
  private readonly finalizationCoordinator: OpenCodeStreamingFinalizationCoordinator;
  private readonly legacyReader: OpenCodeLegacySseStreamReader;

  constructor(private readonly host: OpenCodeStreamingRuntimeCoordinatorHost) {
    this.finalizationCoordinator = new OpenCodeStreamingFinalizationCoordinator({
      delay: (ms, signal) => this.host.delay(ms, signal),
      getSessionMessages: (sessionId) => this.host.getSessionMessages(sessionId),
    });
    this.legacyReader = new OpenCodeLegacySseStreamReader({
      getLegacyEventStreamRequest: () => this.host.getLegacyEventStreamRequest(),
      parseSSEEvents: (buffer) => this.host.streamEventTransformer.parseSSEEvents(buffer),
    });
  }

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

      logger.debug('Assistant stream finalization [service-sdk-event-stream-ended]:', {
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
    const eventStream = this.legacyReader.connectSSE(signal);
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

    logger.debug('Assistant stream finalization [service-legacy-event-stream-ended]:', {
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
    yield* this.finalizationCoordinator.finishStreamingResponse(
      sessionId,
      state,
      promptMessageId,
    );
  }

  private buildErrorChunk(error: unknown): StreamChunk {
    return {
      type: 'error',
      content: error instanceof Error ? error.message : 'Unknown error',
    };
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

  private normalizeSessionId(sessionId?: string | null): string {
    return typeof sessionId === 'string' ? sessionId : '';
  }
}
