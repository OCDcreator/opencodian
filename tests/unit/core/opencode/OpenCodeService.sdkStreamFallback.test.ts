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
    mockSdkClient.session.messages.mockImplementation(async () => {
      const promptMessageId = mockSdkClient.session.promptAsync.mock.calls[0]?.[0]?.messageID;
      return [
        {
          info: {
            id: 'assistant-42',
            parentID: promptMessageId,
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
      ];
    });
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
    mockSdkClient.session.messages.mockImplementation(async () => {
      const promptMessageId = mockSdkClient.session.promptAsync.mock.calls[0]?.[0]?.messageID;
      return [
        {
          info: {
            id: 'assistant-err',
            parentID: promptMessageId,
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
      ];
    });
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
