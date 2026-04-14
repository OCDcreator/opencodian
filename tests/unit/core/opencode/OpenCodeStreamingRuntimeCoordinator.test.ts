import { TextDecoder } from 'util';

import {
  OpenCodeStreamingRuntimeCoordinator,
  type OpenCodeStreamingRuntimeCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeStreamingRuntimeCoordinator';
import { OpenCodeStreamEventTransformer } from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';

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

function createHost(
  overrides: Partial<OpenCodeStreamingRuntimeCoordinatorHost> = {},
): jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost> {
  return {
    abortSessionOnServer: jest.fn().mockResolvedValue(undefined),
    getLegacyEventStreamRequest: jest.fn().mockReturnValue({
      url: 'http://127.0.0.1:4196/event',
      headers: {
        Accept: 'text/event-stream',
      },
    }),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    logServiceWarning: jest.fn(),
    streamEventTransformer: createStreamEventTransformer(),
    ...overrides,
  } as jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost>;
}

describe('OpenCodeStreamingRuntimeCoordinator', () => {
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

    const chunks: unknown[] = [];
    for await (const chunk of coordinator.streamSdkResponse({
      sessionId: 'sdk-session',
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
});
