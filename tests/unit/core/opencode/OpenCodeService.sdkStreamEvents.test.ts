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
