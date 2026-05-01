import type { OpenCodeSSEEvent } from './OpenCodeStreamEventTransformer';

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

export interface OpenCodeLegacySseStreamReaderHost {
  getLegacyEventStreamRequest(): {
    url: string;
    headers: Record<string, string>;
  };
  parseSSEEvents(buffer: string): { events: OpenCodeSSEEvent[]; remaining: string };
}

export class OpenCodeLegacySseStreamReader {
  constructor(private readonly host: OpenCodeLegacySseStreamReaderHost) {}

  async *connectSSE(signal?: AbortSignal): AsyncGenerator<OpenCodeSSEEvent> {
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
    const events = this.host.parseSSEEvents(state.buffer);
    state.buffer = events.remaining;
    yield* events.events;
  }

  private *emitRemainingSseEvents(buffer: string): Generator<OpenCodeSSEEvent, void, void> {
    const events = this.host.parseSSEEvents(buffer + '\n\n');
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
}
