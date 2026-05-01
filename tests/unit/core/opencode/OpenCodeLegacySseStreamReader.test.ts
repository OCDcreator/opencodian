import { TextDecoder } from 'util';

import {
  OpenCodeLegacySseStreamReader,
  type OpenCodeLegacySseStreamReaderHost,
} from '../../../../src/core/opencode/OpenCodeLegacySseStreamReader';
import type { OpenCodeSSEEvent } from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';

const originalFetch = global.fetch;

global.TextDecoder = TextDecoder as typeof global.TextDecoder;

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
  overrides: Partial<OpenCodeLegacySseStreamReaderHost> = {},
): jest.Mocked<OpenCodeLegacySseStreamReaderHost> {
  return {
    getLegacyEventStreamRequest: jest.fn().mockReturnValue({
      url: 'http://127.0.0.1:4196/event',
      headers: {
        Accept: 'text/event-stream',
      },
    }),
    parseSSEEvents: jest.fn().mockImplementation((buffer: string) => {
      const events: OpenCodeSSEEvent[] = [];
      const lines = buffer.split('\n');
      let currentEvent: Partial<OpenCodeSSEEvent> = {};
      let remainingBuffer = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('data: ')) {
          currentEvent.data = (currentEvent.data || '') + line.slice(6);
        } else if (line === '') {
          if (currentEvent.data) {
            events.push({ event: 'message', data: currentEvent.data });
            currentEvent = {};
          }
        } else {
          remainingBuffer += line + '\n';
        }
      }

      if (currentEvent.data) {
        remainingBuffer = `data: ${currentEvent.data}\n`;
      }

      return { events, remaining: remainingBuffer };
    }),
    ...overrides,
  } as jest.Mocked<OpenCodeLegacySseStreamReaderHost>;
}

describe('OpenCodeLegacySseStreamReader connection lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('opens a fetch connection and yields parsed SSE events', async () => {
    global.fetch = createSseFetchMock([
      '{"type":"session.idle","properties":{"sessionID":"test"}}',
    ]) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE()) {
      events.push(event);
    }

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4196/event',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
        }),
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"type":"session.idle","properties":{"sessionID":"test"}}');
  });

  it('throws when SSE connection returns non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());

    await expect(async () => {
      for await (const _event of reader.connectSSE()) {
        void _event;
      }
    }).rejects.toThrow('SSE connection failed: 503 Service Unavailable');
  });

  it('throws when SSE response has no body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
    }) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());

    await expect(async () => {
      for await (const _event of reader.connectSSE()) {
        void _event;
      }
    }).rejects.toThrow('SSE response has no body');
  });

  it('returns early when signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE(abortController.signal)) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('OpenCodeLegacySseStreamReader chunked event parsing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('parses events split across multiple raw chunks', async () => {
    global.fetch = createRawSseFetchMock([
      'data: {"type":"message.part.delta","properties":{"sessionID":"chunk-test","delta":',
      '"hello"}}\n\ndata: {"type":"session.idle","properties":{"sessionID":"chunk-test"}}',
    ]) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE()) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].data).toContain('message.part.delta');
    expect(events[1].data).toContain('session.idle');
  });

  it('flushes incomplete buffered event at EOF', async () => {
    const parseSSEEvents = jest.fn().mockImplementation((buffer: string) => {
      if (buffer.includes('session.idle')) {
        return {
          events: [{ event: 'message', data: '{"type":"session.idle"}' }],
          remaining: '',
        };
      }
      return { events: [], remaining: buffer };
    });

    global.fetch = createRawSseFetchMock([
      'data: {"type":"session.idle","properties":{"sessionID":"flush-test"}}',
    ]) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost({ parseSSEEvents }));
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"type":"session.idle"}');
  });
});

describe('OpenCodeLegacySseStreamReader abort handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('cancels the reader when abort signal fires', async () => {
    const abortController = new AbortController();
    const releaseLockMock = jest.fn();
    let readReject: (reason?: unknown) => void;

    const cancelMock = jest.fn().mockImplementation(() => {
      readReject?.(new Error('AbortError'));
      return Promise.resolve(undefined);
    });

    let readCallCount = 0;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn().mockImplementation(() => {
            readCallCount++;
            if (readCallCount === 1) {
              setTimeout(() => abortController.abort(), 10);
              return Promise.resolve({
                done: false,
                value: Uint8Array.from(Buffer.from('data: {"type":"first"}\n\n')),
              });
            }
            return new Promise((_resolve, reject) => {
              readReject = reject;
            });
          }),
          cancel: cancelMock,
          releaseLock: releaseLockMock,
        }),
      },
    }) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE(abortController.signal)) {
      events.push(event);
    }

    expect(cancelMock).toHaveBeenCalled();
    expect(releaseLockMock).toHaveBeenCalled();
  });

  it('stops yielding events when stream is aborted mid-read', async () => {
    const abortController = new AbortController();
    const cancelMock = jest.fn();
    const releaseLockMock = jest.fn();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: jest.fn().mockImplementation(() => {
            abortController.abort();
            return Promise.reject(new Error('AbortError'));
          }),
          cancel: cancelMock,
          releaseLock: releaseLockMock,
        }),
      },
    }) as typeof global.fetch;

    const reader = new OpenCodeLegacySseStreamReader(createHost());
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE(abortController.signal)) {
      events.push(event);
    }

    expect(events).toHaveLength(0);
  });
});

describe('OpenCodeLegacySseStreamReader host delegation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('delegates SSE event parsing to host.parseSSEEvents', async () => {
    const parseSSEEvents = jest.fn().mockReturnValue({
      events: [{ event: 'message', data: '{"type":"custom"}' }],
      remaining: '',
    });

    global.fetch = createSseFetchMock(['{"type":"custom"}']) as typeof global.fetch;

    const host = createHost({ parseSSEEvents });
    const reader = new OpenCodeLegacySseStreamReader(host);
    const events: OpenCodeSSEEvent[] = [];

    for await (const event of reader.connectSSE()) {
      events.push(event);
    }

    expect(parseSSEEvents).toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('{"type":"custom"}');
  });

  it('delegates request parameters to host.getLegacyEventStreamRequest', async () => {
    const getLegacyEventStreamRequest = jest.fn().mockReturnValue({
      url: 'http://custom:8080/events',
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    global.fetch = createSseFetchMock(['{"type":"test"}']) as typeof global.fetch;

    const host = createHost({ getLegacyEventStreamRequest });
    const reader = new OpenCodeLegacySseStreamReader(host);

    for await (const _event of reader.connectSSE()) {
      void _event;
    }

    expect(getLegacyEventStreamRequest).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://custom:8080/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });
});
