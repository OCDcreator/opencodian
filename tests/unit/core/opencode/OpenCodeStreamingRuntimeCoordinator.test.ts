/* eslint-disable max-lines-per-function -- Transport matrix intentionally shares one runtime fixture. */
import { TextDecoder } from 'util';

import type {
  OpenCodeStreamEvent,
  OpenCodeStreamEventState,
} from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';
import { OpenCodeStreamEventTransformer } from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';
import {
  type OpenCodeStreamingRuntimeContext,
  OpenCodeStreamingRuntimeCoordinator,
  type OpenCodeStreamingRuntimeCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeStreamingRuntimeCoordinator';

const originalFetch = global.fetch;

global.TextDecoder = TextDecoder as typeof global.TextDecoder;

function createStreamEventTransformer(): OpenCodeStreamEventTransformer {
  return new OpenCodeStreamEventTransformer({
    observeRuntimeToolNames: () => false,
    getOpenCodeToolKind: () => 'custom',
    normalizeQuestionRequest: () => null,
    logStreamingDebug: () => undefined,
  });
}

function createSseFetchMock(events: string[]): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    body: {
      getReader: () => {
        const chunks = [
          ...events.map((event) => ({
            done: false,
            value: Uint8Array.from(Buffer.from(`data: ${event}\n\n`)),
          })),
          {
            done: true,
            value: undefined,
          },
        ];
        return {
          read: jest.fn().mockImplementation(() => Promise.resolve(chunks.shift() ?? {
            done: true,
            value: undefined,
          })),
          cancel: jest.fn(),
          releaseLock: jest.fn(),
        };
      },
    },
  });
}

function createRawSseFetchMock(chunks: string[]): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    body: {
      getReader: () => {
        const readChunks = [
          ...chunks.map((chunk) => ({
            done: false,
            value: Uint8Array.from(Buffer.from(chunk)),
          })),
          {
            done: true,
            value: undefined,
          },
        ];
        return {
          read: jest.fn().mockImplementation(() => Promise.resolve(readChunks.shift() ?? {
            done: true,
            value: undefined,
          })),
          cancel: jest.fn(),
          releaseLock: jest.fn(),
        };
      },
    },
  });
}

function createHost(
  overrides: Partial<OpenCodeStreamingRuntimeCoordinatorHost> = {},
): jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost> {
  return {
    applyStreamMutations: jest.fn(),
    abortSessionOnServer: jest.fn().mockResolvedValue(undefined),
    delay: jest.fn().mockResolvedValue(undefined),
    getLegacyEventStreamRequest: jest.fn().mockReturnValue({
      url: 'http://127.0.0.1:4196/event',
      headers: {
        Accept: 'text/event-stream',
      },
    }),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    logServiceWarning: jest.fn(),
    observeReconnect: jest.fn(),
    streamEventTransformer: createStreamEventTransformer(),
    ...overrides,
  } as jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost>;
}

describe('OpenCodeStreamingRuntimeCoordinator active stream contexts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('tracks part types independently across concurrent session contexts', () => {
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(createHost());
    const left = coordinator.createActiveStreamContext('session-left');
    const right = coordinator.createActiveStreamContext('session-right');

    left.setPartType('part-1', 'thinking');
    right.setPartType('part-1', 'tool');

    expect(left.getPartType('part-1')).toBe('thinking');
    expect(right.getPartType('part-1')).toBe('tool');
    expect(left.hasPartType('missing')).toBe(false);
  });

  it('replaces only the current session context and keeps the replacement registered', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const original = coordinator.createActiveStreamContext('session-1');
    const otherSession = coordinator.createActiveStreamContext('session-2');

    const replacement = coordinator.createActiveStreamContext('session-1');
    coordinator.releaseActiveStreamContext(original);
    coordinator.cancelStream('session-1');

    expect(original.signal.aborted).toBe(true);
    expect(otherSession.signal.aborted).toBe(false);
    expect(replacement.signal.aborted).toBe(true);
    expect(host.abortSessionOnServer).toHaveBeenCalledWith('session-1');
  });

  it('cancels server-side work only for explicit cancellation, not local detach', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const cancelContext = coordinator.createActiveStreamContext('session-cancel');
    const detachContext = coordinator.createActiveStreamContext('session-detach');

    coordinator.cancelStream('session-cancel');
    coordinator.detachStream('session-detach');

    expect(cancelContext.signal.aborted).toBe(true);
    expect(detachContext.signal.aborted).toBe(true);
    expect(host.abortSessionOnServer).toHaveBeenCalledTimes(1);
    expect(host.abortSessionOnServer).toHaveBeenCalledWith('session-cancel');
  });

  it('ignores missing or inactive sessions without calling server abort', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);

    coordinator.cancelStream();
    coordinator.cancelStream('missing-session');
    coordinator.detachStream();
    coordinator.detachStream('missing-session');

    expect(host.abortSessionOnServer).not.toHaveBeenCalled();
  });

  it('aborts and clears all active contexts during runtime disposal', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const left = coordinator.createActiveStreamContext('session-left');
    const right = coordinator.createActiveStreamContext('session-right');

    coordinator.dispose();
    coordinator.cancelStream('session-left');
    coordinator.detachStream('session-right');

    expect(left.signal.aborted).toBe(true);
    expect(right.signal.aborted).toBe(true);
    expect(host.abortSessionOnServer).not.toHaveBeenCalled();
  });
});

describe('OpenCodeStreamingRuntimeCoordinator transport routing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('selects SDK or legacy transport from one runtime entrypoint', async () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const sdkStart = jest.fn().mockResolvedValue(undefined);
    const sdkSubscribe = jest.fn().mockResolvedValue((async function* () {
      yield {
        type: 'session.idle',
        properties: { sessionID: 'sdk-route' },
      } as never;
    })());
    const legacyStart = jest.fn().mockResolvedValue(undefined);

    const sdkChunks: unknown[] = [];
    for await (const chunk of coordinator.streamResponse({
      sessionId: 'sdk-route',
      useSdkStream: true,
      sdk: {
        startPrompt: sdkStart,
        subscribe: sdkSubscribe,
      },
      legacy: {
        startPrompt: legacyStart,
      },
    })) {
      sdkChunks.push(chunk);
    }

    expect(sdkStart).toHaveBeenCalledTimes(1);
    expect(sdkSubscribe).toHaveBeenCalledTimes(1);
    expect(legacyStart).not.toHaveBeenCalled();
    expect(sdkChunks[0]).toEqual({ type: 'message_start' });
    expect(sdkChunks[sdkChunks.length - 1]).toEqual({ type: 'message_stop' });

    global.fetch = createSseFetchMock([
      '{"type":"session.idle","properties":{"sessionID":"legacy-route"}}',
    ]) as typeof global.fetch;

    const nextLegacyStart = jest.fn().mockResolvedValue(undefined);
    const legacyChunks: unknown[] = [];
    for await (const chunk of coordinator.streamResponse({
      sessionId: 'legacy-route',
      useSdkStream: false,
      sdk: {
        startPrompt: sdkStart,
        subscribe: sdkSubscribe,
      },
      legacy: {
        startPrompt: nextLegacyStart,
      },
    })) {
      legacyChunks.push(chunk);
    }

    expect(nextLegacyStart).toHaveBeenCalledTimes(1);
    expect(sdkStart).toHaveBeenCalledTimes(1);
    expect(sdkSubscribe).toHaveBeenCalledTimes(1);
    expect(legacyChunks[0]).toEqual({ type: 'message_start' });
    expect(legacyChunks[legacyChunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('falls back to legacy SSE when the SDK iterator fails before the first event', async () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const subscribe = jest.fn().mockResolvedValue((async function* () {
      throw new Error('sdk stream failed');
      yield undefined as never;
    })());
    global.fetch = createSseFetchMock([
      '{"type":"session.idle","properties":{"sessionID":"sdk-session"}}',
    ]) as typeof global.fetch;
    const traceContext = {
      traceId: 'trace-reconnect',
      runtimeSegmentId: 'runtime-reconnect',
      runId: 'run-reconnect',
      rootSessionId: 'sdk-session',
      sessionId: 'sdk-session',
    };

    const chunks: unknown[] = [];
    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-session',
      traceContext,
      startPrompt,
      subscribe,
    })) {
      chunks.push(chunk);
    }

    expect(startPrompt).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'session.event-stream',
      'SDK event stream failed before first event, falling back to legacy SSE',
      expect.any(Error),
    );
    expect(chunks[0]).toEqual({ type: 'message_start' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4196/event',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(host.observeReconnect).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sessionId: 'sdk-session',
      traceContext,
      name: 'stream.reconnect_attempt',
      severity: 'info',
      payload: expect.objectContaining({ attempt: 1, from: 'sdk', to: 'legacy-sse' }),
    }));
    expect(host.observeReconnect).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sessionId: 'sdk-session',
      traceContext,
      name: 'stream.reconnected',
      payload: { attempts: 1, transport: 'legacy' },
    }));
  });

  it('warns after repeated SDK fallback failures and resets after a successful event', async () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const traceContext = {
      traceId: 'trace-repeated',
      runtimeSegmentId: 'runtime-repeated',
      runId: 'run-repeated',
      rootSessionId: 'sdk-repeated',
      sessionId: 'sdk-repeated',
    };
    global.fetch = jest.fn().mockRejectedValue(new Error('legacy unavailable')) as typeof global.fetch;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      for await (const _chunk of coordinator.streamSdkResponse({
        sessionId: 'sdk-repeated',
        traceContext,
        startPrompt: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockRejectedValue(new Error('sdk unavailable')),
      })) {
        void _chunk;
      }
    }

    expect(host.observeReconnect).toHaveBeenCalledWith(expect.objectContaining({
      name: 'anomaly.stream_reconnect_repeated',
      severity: 'warning',
      payload: expect.objectContaining({ attempt: 3 }),
    }));

    for await (const _chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-repeated',
      traceContext,
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sdk-repeated' },
        } as never;
      })()),
    })) {
      void _chunk;
    }

    expect(host.observeReconnect).toHaveBeenCalledWith(expect.objectContaining({
      name: 'stream.reconnected',
      severity: 'info',
      payload: { attempts: 3, transport: 'sdk' },
    }));
  });

  it('passes one explicit run context and source event id through raw and normalized observers', async () => {
    const observeIngress = jest.fn();
    const observeOutcome = jest.fn();
    const host = createHost({ observeIngress, observeOutcome });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const traceContext = {
      traceId: 'trace-explicit',
      runtimeSegmentId: 'runtime-explicit',
      runId: 'run-explicit',
      sessionId: 'sdk-session',
    };
    const subscribe = jest.fn().mockResolvedValue((async function* () {
      yield {
        type: 'session.idle',
        properties: { sessionID: 'sdk-session' },
      };
    })());

    for await (const _chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-session',
      traceContext,
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe,
    })) {
      void _chunk;
    }

    expect(observeIngress).toHaveBeenCalledWith(
      'sdk-session',
      'sdk',
      expect.any(Object),
      traceContext,
      expect.any(String),
    );
    const sourceEventId = observeIngress.mock.calls[0]?.[4];
    expect(observeOutcome).toHaveBeenCalledWith(
      'sdk-session',
      'sdk',
      expect.any(Object),
      traceContext,
      sourceEventId,
    );
  });
});

describe('OpenCodeStreamingRuntimeCoordinator legacy SSE handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('finalizes a legacy stream with assistant metadata after session.idle', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-42',
            sessionID: 'legacy-session',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567890 },
          },
          parts: [
            {
              id: 'part-1',
              sessionID: 'legacy-session',
              messageID: 'assistant-42',
              type: 'text',
              text: 'Hello from SSE',
            },
          ],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    global.fetch = createSseFetchMock([
      '{"type":"session.idle","properties":{"sessionID":"legacy-session"}}',
    ]) as typeof global.fetch;

    const chunks: unknown[] = [];
    for await (const chunk of coordinator.streamLegacyResponse({
      sessionId: 'legacy-session',
      startPrompt,
    })) {
      chunks.push(chunk);
    }

    expect(startPrompt).toHaveBeenCalled();
    expect(chunks[0]).toEqual({ type: 'message_start' });
    expect(chunks).toContainEqual({ type: 'text', content: 'Hello from SSE' });
    expect(chunks).toContainEqual({
      type: 'message_metadata',
      messageId: 'assistant-42',
      timestamp: 1234567890,
      modelId: 'openai/gpt-5',
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('parses split SSE chunks and flushes the final buffered event at EOF', async () => {
    const transformer = createStreamEventTransformer();
    const handleStreamingEvent = jest.spyOn(transformer, 'handleStreamingEvent').mockImplementation((
      eventData: OpenCodeStreamEvent,
      _sessionId: string,
      state: OpenCodeStreamEventState,
        ) => {
          if (eventData.type === 'message.part.delta') {
            state.lastContent = 'Hi';
            return {
              chunks: [{ type: 'text', content: 'Hi' }],
              mutations: [],
              stop: false,
            };
          }

          return {
            chunks: [],
            mutations: [],
            stop: eventData.type === 'session.idle',
          };
        });
    const host = createHost({
      streamEventTransformer: transformer,
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    global.fetch = createRawSseFetchMock([
      'data: not-json\n\n',
      'data: {"type":"message.part.delta","properties":{"sessionID":"legacy-buffer","delta":',
      '"Hi"}}\n\n',
      'data: {"type":"session.idle","properties":{"sessionID":"legacy-buffer"}}',
    ]) as typeof global.fetch;

    const chunks: unknown[] = [];
    for await (const chunk of coordinator.streamLegacyResponse({
      sessionId: 'legacy-buffer',
      startPrompt: jest.fn().mockResolvedValue(undefined),
    })) {
      chunks.push(chunk);
    }

    expect(handleStreamingEvent.mock.calls.map(([eventData]) => eventData.type)).toEqual([
      'message.part.delta',
      'session.idle',
    ]);
    expect(chunks).toContainEqual({ type: 'text', content: 'Hi' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('applies canonical stream mutations before yielding transformed chunks', async () => {
    const callOrder: string[] = [];
    const host = createHost({
      applyStreamMutations: jest.fn(() => {
        callOrder.push('apply');
      }),
      streamEventTransformer: {
        handleStreamingEvent: jest.fn().mockReturnValue({
          chunks: [{ type: 'text', content: 'Hello' }],
          mutations: [
            {
              type: 'message.upserted',
              sessionID: 'sdk-order',
              messageID: 'assistant-order',
            },
          ],
          stop: false,
        }),
        parseSSEEventPayload: jest.fn().mockReturnValue(null),
        parseSSEEvents: jest.fn().mockReturnValue({ events: [], remaining: '' }),
      },
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-order',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield { type: 'ignored' } as never;
      })()),
    })) {
      if ((chunk as { type?: string }).type === 'text') {
        callOrder.push('chunk');
      }
    }

    expect(host.applyStreamMutations).toHaveBeenCalledWith([
      {
        type: 'message.upserted',
        sessionID: 'sdk-order',
        messageID: 'assistant-order',
      },
    ]);
    expect(callOrder).toEqual(['apply', 'chunk']);
  });

  it('subscribes to the SDK event stream before starting the prompt', async () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const callOrder: string[] = [];

    const subscribe = jest.fn().mockImplementation(async () => {
      callOrder.push('subscribe');
      return (async function* () {
        yield {
          type: 'session.idle',
          properties: { sessionID: 'sdk-subscribe-first' },
        } as never;
      })();
    });
    const startPrompt = jest.fn().mockImplementation(async () => {
      callOrder.push('start');
    });

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-subscribe-first',
      startPrompt,
      subscribe,
    })) {
      void chunk;
    }

    expect(callOrder.slice(0, 2)).toEqual(['subscribe', 'start']);
  });
});

describe('OpenCodeStreamingRuntimeCoordinator SDK tail recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('emits only the assistant tail delta during SDK finalization', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-tail',
            sessionID: 'sdk-tail',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567891 },
          },
          parts: [
            {
              id: 'part-tail',
              sessionID: 'sdk-tail',
              messageID: 'assistant-tail',
              type: 'text',
              text: 'Hello from SDK',
            },
          ],
        },
      ]),
      streamEventTransformer: {
        handleStreamingEvent: jest.fn().mockImplementation((
          _event: OpenCodeStreamEvent,
          _sessionId: string,
          state: OpenCodeStreamEventState,
          _streamContext: OpenCodeStreamingRuntimeContext,
        ) => {
          state.lastContent = 'Hello';
          return {
            chunks: [{ type: 'text', content: 'Hello' }],
            mutations: [],
            stop: false,
          };
        }),
        parseSSEEventPayload: jest.fn().mockReturnValue(null),
        parseSSEEvents: jest.fn().mockReturnValue({ events: [], remaining: '' }),
      },
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-tail',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield { type: 'ignored' } as never;
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'text', content: 'Hello' },
      { type: 'text', content: ' from SDK' },
      {
        type: 'message_metadata',
        messageId: 'assistant-tail',
        timestamp: 1234567891,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('uses the latest assistant message even when a trailing user message exists', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-latest',
            sessionID: 'sdk-latest-assistant',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567893 },
          },
          parts: [
            {
              id: 'part-latest',
              sessionID: 'sdk-latest-assistant',
              messageID: 'assistant-latest',
              type: 'text',
              text: 'Recovered assistant tail',
            },
          ],
        },
        {
          info: {
            id: 'user-after-assistant',
            sessionID: 'sdk-latest-assistant',
            role: 'user',
            time: { created: 1234567894 },
          },
          parts: [
            {
              id: 'user-part',
              sessionID: 'sdk-latest-assistant',
              messageID: 'user-after-assistant',
              type: 'text',
              text: 'A later user message should not replace the assistant tail',
            },
          ],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-latest-assistant',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield* [];
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'text', content: 'Recovered assistant tail' },
      {
        type: 'message_metadata',
        messageId: 'assistant-latest',
        timestamp: 1234567893,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('does not recover an earlier assistant for a later prompt message', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'user-first',
            sessionID: 'sdk-prompt-filter',
            role: 'user',
            time: { created: 1234567890 },
          },
          parts: [],
        },
        {
          info: {
            id: 'assistant-first',
            parentID: 'user-first',
            sessionID: 'sdk-prompt-filter',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567891 },
          },
          parts: [
            {
              id: 'part-first',
              sessionID: 'sdk-prompt-filter',
              messageID: 'assistant-first',
              type: 'text',
              text: 'Previous assistant text',
            },
          ],
        },
        {
          info: {
            id: 'user-second',
            sessionID: 'sdk-prompt-filter',
            role: 'user',
            time: { created: 1234567892 },
          },
          parts: [],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-prompt-filter',
      promptMessageId: 'user-second',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield* [];
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'message_stop' },
    ]);
  });

});

describe('OpenCodeStreamingRuntimeCoordinator SDK prompt-scoped tail retry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('retries assistant tail lookup for the current prompt before giving up', async () => {
    const host = createHost({
      getSessionMessages: jest.fn()
        .mockResolvedValueOnce([
          {
            info: {
              id: 'user-first',
              sessionID: 'sdk-tail-retry',
              role: 'user',
              time: { created: 1234567890 },
            },
            parts: [],
          },
          {
            info: {
              id: 'assistant-first',
              parentID: 'user-first',
              sessionID: 'sdk-tail-retry',
              role: 'assistant',
              providerID: 'openai',
              modelID: 'gpt-5',
              time: { created: 1234567891 },
            },
            parts: [
              {
                id: 'part-first',
                sessionID: 'sdk-tail-retry',
                messageID: 'assistant-first',
                type: 'text',
                text: 'Previous assistant text',
              },
            ],
          },
          {
            info: {
              id: 'user-second',
              sessionID: 'sdk-tail-retry',
              role: 'user',
              time: { created: 1234567892 },
            },
            parts: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            info: {
              id: 'user-first',
              sessionID: 'sdk-tail-retry',
              role: 'user',
              time: { created: 1234567890 },
            },
            parts: [],
          },
          {
            info: {
              id: 'assistant-first',
              parentID: 'user-first',
              sessionID: 'sdk-tail-retry',
              role: 'assistant',
              providerID: 'openai',
              modelID: 'gpt-5',
              time: { created: 1234567891 },
            },
            parts: [
              {
                id: 'part-first',
                sessionID: 'sdk-tail-retry',
                messageID: 'assistant-first',
                type: 'text',
                text: 'Previous assistant text',
              },
            ],
          },
          {
            info: {
              id: 'user-second',
              sessionID: 'sdk-tail-retry',
              role: 'user',
              time: { created: 1234567892 },
            },
            parts: [],
          },
          {
            info: {
              id: 'assistant-second',
              parentID: 'user-second',
              sessionID: 'sdk-tail-retry',
              role: 'assistant',
              providerID: 'openai',
              modelID: 'gpt-5',
              time: { created: 1234567893 },
            },
            parts: [
              {
                id: 'part-second',
                sessionID: 'sdk-tail-retry',
                messageID: 'assistant-second',
                type: 'text',
                text: 'Recovered current assistant',
              },
            ],
          },
        ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-tail-retry',
      promptMessageId: 'user-second',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield* [];
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(host.getSessionMessages).toHaveBeenCalledTimes(2);
    expect(host.delay).toHaveBeenCalled();
    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'text', content: 'Recovered current assistant' },
      {
        type: 'message_metadata',
        messageId: 'assistant-second',
        timestamp: 1234567893,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

});

describe('OpenCodeStreamingRuntimeCoordinator SDK prompt-scoped tail content recovery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('recovers visible thinking and tool chunks from the assistant tail when the SDK stream emitted none', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-tool-thinking',
            parentID: 'user-tool-thinking',
            sessionID: 'sdk-tail-content-recovery',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567894 },
          },
          parts: [
            {
              id: 'part-thinking',
              sessionID: 'sdk-tail-content-recovery',
              messageID: 'assistant-tool-thinking',
              type: 'reasoning',
              text: 'Need to inspect the file first',
              time: { start: 1_000, end: 2_500 },
            },
            {
              id: 'part-tool',
              sessionID: 'sdk-tail-content-recovery',
              messageID: 'assistant-tool-thinking',
              type: 'tool',
              callID: 'call-read',
              tool: 'read',
              state: {
                status: 'completed',
                input: { file_path: 'docs/spec.md' },
                output: 'Spec loaded',
              },
            },
          ],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-tail-content-recovery',
      promptMessageId: 'user-tool-thinking',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield* [];
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      {
        type: 'thinking',
        content: 'Need to inspect the file first',
        partId: 'part-thinking',
        durationSeconds: 1.5,
      },
      {
        type: 'tool_use',
        id: 'call-read',
        name: 'read',
        input: { file_path: 'docs/spec.md' },
      },
      {
        type: 'tool_result',
        toolUseId: 'call-read',
        content: 'Spec loaded',
        isError: false,
      },
      {
        type: 'message_metadata',
        messageId: 'assistant-tool-thinking',
        timestamp: 1234567894,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingRuntimeCoordinator SDK error fallback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('emits assistant error fallback when finalization finds a structured assistant error', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-error',
            sessionID: 'sdk-error',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567892 },
            error: {
              data: {
                message: 'Rate limit hit',
                statusCode: 429,
              },
            },
          },
          parts: [],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-error',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield* [];
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'error', content: 'Rate limit hit (HTTP 429)' },
      {
        type: 'message_metadata',
        messageId: 'assistant-error',
        timestamp: 1234567892,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('does not duplicate assistant error fallback after the stream already emitted one', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'assistant-error-repeat',
            sessionID: 'sdk-error-repeat',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567895 },
            error: {
              data: {
                message: 'Rate limit hit',
                statusCode: 429,
              },
            },
          },
          parts: [],
        },
      ]),
      streamEventTransformer: {
        handleStreamingEvent: jest.fn().mockImplementation((
          _event: OpenCodeStreamEvent,
          _sessionId: string,
          state: OpenCodeStreamEventState,
        ) => {
          state.lastErrorMessage = 'Rate limit hit (HTTP 429)';
          return {
            chunks: [{ type: 'error', content: 'Rate limit hit (HTTP 429)' }],
            mutations: [],
            stop: false,
          };
        }),
        parseSSEEventPayload: jest.fn().mockReturnValue(null),
        parseSSEEvents: jest.fn().mockReturnValue({ events: [], remaining: '' }),
      },
    });
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-error-repeat',
      startPrompt: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue((async function* () {
        yield { type: 'ignored' } as never;
      })()),
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'error', content: 'Rate limit hit (HTTP 429)' },
      {
        type: 'message_metadata',
        messageId: 'assistant-error-repeat',
        timestamp: 1234567895,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});
