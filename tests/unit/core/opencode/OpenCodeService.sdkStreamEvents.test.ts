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

describe('OpenCodeService SDK stream completion metadata', () => {
  it('emits final assistant metadata from SDK stream completion', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([
      {
        info: {
          id: 'assistant-42',
          sessionID: 'test-session',
          role: 'assistant',
          providerID: 'openai',
          modelID: 'gpt-5',
          time: { created: 1234567890 },
        },
        parts: [
          {
            id: 'part-1',
            sessionID: 'test-session',
            messageID: 'assistant-42',
            type: 'text',
            text: 'Hello',
          },
        ],
      },
    ]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: 'message_metadata',
      messageId: 'assistant-42',
      timestamp: 1234567890,
      modelId: 'openai/gpt-5',
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('emits a real SDK session.error message instead of falling back to an empty response', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.error',
          properties: {
            sessionID: 'test-session',
            error: {
              name: 'APIError',
              data: {
                message: 'Incorrect API key provided.',
                statusCode: 401,
                isRetryable: false,
              },
            },
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

    expect(chunks).toContainEqual({
      type: 'error',
      content: 'Incorrect API key provided. (HTTP 401)',
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('falls back to assistant message error metadata when the stream ends without text', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'test-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([
      {
        info: {
          id: 'assistant-err',
          sessionID: 'test-session',
          role: 'assistant',
          providerID: 'alibaba',
          modelID: 'qwen-plus',
          error: {
            name: 'APIError',
            data: {
              message: 'Incorrect API key provided.',
              statusCode: 401,
              isRetryable: false,
            },
          },
          time: { created: 1234567890 },
        },
        parts: [],
      },
    ]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'test-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: 'error',
      content: 'Incorrect API key provided. (HTTP 401)',
    });
    expect(chunks).toContainEqual({
      type: 'message_metadata',
      messageId: 'assistant-err',
      timestamp: 1234567890,
      modelId: 'alibaba/qwen-plus',
    });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });
});

describe('OpenCodeService SDK tool and session stream events', () => {
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
