import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  type MockOpenCodeServiceSdkClient,
  OpenCodeService,
} from './OpenCodeService.testSupport';

let service: OpenCodeService;
let mockSdkClient: MockOpenCodeServiceSdkClient;

const createServiceWithSdkFlags = () => new OpenCodeService(
  DEFAULT_SETTINGS,
  {},
  { sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS },
);

beforeEach(() => {
  ({ service, mockSdkClient } = createOpenCodeServiceTestContext());
});

describe('OpenCodeService SDK tool stream events', () => {
  it('re-emits tool_use when later stream updates provide richer tool input', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-tool-1',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'read',
              state: {
                status: 'running',
                input: {},
              },
            },
          },
        };
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-tool-1',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'read',
              state: {
                status: 'running',
                input: {
                  file_path: 'docs/architecture/README.md',
                },
              },
            },
          },
        };
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_use',
        id: 'call-tool-1',
        name: 'read',
        kind: 'builtin',
        input: {},
      }),
      expect.objectContaining({
        type: 'tool_use',
        id: 'call-tool-1',
        name: 'read',
        kind: 'builtin',
        input: {
          file_path: 'docs/architecture/README.md',
        },
      }),
    ]));
  });

  it('ignores internal StructuredOutput tool events from the SDK stream', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-tool-1',
              sessionID: 'test-session',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'StructuredOutput',
              state: {
                status: 'running',
                input: {
                  schema: { type: 'object' },
                },
              },
            },
          },
        };
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-tool-1',
              sessionID: 'test-session',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'StructuredOutput',
              state: {
                status: 'completed',
                output: '{"title":"Generated title"}',
              },
            },
          },
        };
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    const toolChunks = chunks.filter((chunk) => (
      typeof chunk === 'object'
      && chunk !== null
      && (
        (chunk as { type?: string }).type === 'tool_use'
        || (chunk as { type?: string }).type === 'tool_result'
      )
    ));
    expect(toolChunks).toEqual([]);
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });
});

describe('OpenCodeService SDK canonical stream mutations', () => {
  it('updates canonical assistant parts during tool-first text-late SDK streams', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    let releaseTail: (() => void) | null = null;
    const tailGate = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-tool-1',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'read',
              state: {
                status: 'running',
                input: {
                  file_path: 'docs/architecture/README.md',
                },
              },
            },
          },
        };
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-text-1',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'text',
              text: '',
            },
          },
        };
        await tailGate;
        yield {
          type: 'message.part.delta',
          properties: {
            sessionID: 'test-session',
            messageID: 'assistant-1',
            partID: 'part-text-1',
            field: 'text',
            delta: 'Hello from canonical stream',
          },
        };
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockImplementation(async () => {
      const promptMessageId = mockSdkClient.session.promptAsync.mock.calls[0]?.[0]?.messageID;
      return [
        {
          info: {
            id: 'assistant-1',
            parentID: promptMessageId,
            sessionID: 'test-session',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5',
            time: { created: 1234567890 },
          },
          parts: [
            {
              id: 'part-tool-1',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'tool',
              callID: 'call-tool-1',
              tool: 'read',
              state: {
                status: 'running',
                input: {
                  file_path: 'docs/architecture/README.md',
                },
              },
            },
            {
              id: 'part-text-1',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'text',
              text: 'Hello from canonical stream',
            },
          ],
        },
      ];
    });
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const iterator = service.sendMessage('Hello', { sessionId: 'test-session' })[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({
      value: { type: 'message_start' },
      done: false,
    });
    expect(await iterator.next()).toEqual({
      value: {
        type: 'tool_use',
        id: 'call-tool-1',
        name: 'read',
        kind: 'builtin',
        input: {
          file_path: 'docs/architecture/README.md',
        },
      },
      done: false,
    });

    const pendingDeltaChunk = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.getCanonicalSessionMessages('test-session')).toEqual([
      {
        info: expect.objectContaining({
          id: 'assistant-1',
          sessionID: 'test-session',
          role: 'assistant',
        }),
        parts: [
          expect.objectContaining({
            id: 'part-text-1',
            type: 'text',
            text: '',
          }),
          expect.objectContaining({
            id: 'part-tool-1',
            type: 'tool',
            tool: 'read',
          }),
        ],
      },
    ]);

    releaseTail?.();
    expect(await pendingDeltaChunk).toEqual({
      value: {
        type: 'text',
        content: 'Hello from canonical stream',
      },
      done: false,
    });
    expect(service.getCanonicalSessionMessages('test-session')).toEqual([
      {
        info: expect.objectContaining({
          id: 'assistant-1',
          sessionID: 'test-session',
          role: 'assistant',
        }),
        parts: [
          expect.objectContaining({
            id: 'part-text-1',
            type: 'text',
            text: 'Hello from canonical stream',
          }),
          expect.objectContaining({
            id: 'part-tool-1',
            type: 'tool',
            tool: 'read',
          }),
        ],
      },
    ]);

    const remainingChunks: unknown[] = [];
    let nextChunk = await iterator.next();
    while (!nextChunk.done) {
      remainingChunks.push(nextChunk.value);
      nextChunk = await iterator.next();
    }
    expect(remainingChunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'message_metadata',
        messageId: 'assistant-1',
      }),
      { type: 'message_stop' },
    ]));
  });
});

describe('OpenCodeService SDK session-scoped stream filters', () => {
  it('ignores SDK stream events when the part sessionID does not match the active session', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'message.part.updated',
          properties: {
            sessionID: 'test-session',
            part: {
              id: 'part-1',
              sessionID: 'other-session',
              type: 'text',
            },
          },
        };
        yield {
          type: 'message.part.delta',
          properties: {
            sessionID: 'test-session',
            partID: 'part-1',
            field: 'text',
            delta: 'Should be ignored',
            part: {
              id: 'part-1',
              sessionID: 'other-session',
              type: 'text',
            },
          },
        };
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual({
      type: 'text',
      content: 'Should be ignored',
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });
});
