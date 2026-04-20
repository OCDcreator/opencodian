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

describe('OpenCodeService SDK prompt requests', () => {
  it('maps requestAssistantResponse through SDK prompt with shared prompt options', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('sdk-session');
    mockSdkClient.session.prompt.mockResolvedValue({
      info: {
        id: 'assistant-1',
        sessionID: 'sdk-session',
        role: 'assistant',
        structured: { title: 'Generated title' },
        time: { created: 1234567890 },
      },
      parts: [
        {
          id: 'part-1',
          sessionID: 'sdk-session',
          messageID: 'assistant-1',
          type: 'text',
          text: 'Generated title',
        },
      ],
    });

    const response = await service.requestAssistantResponse('Create a title', {
      sessionId: 'sdk-session',
      provider: 'openai',
      model: 'gpt-5',
      system: 'Return only the title',
      agent: 'title',
      noReply: false,
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      allowedTools: ['read', 'grep'],
      reasoningEffort: 'high',
    });

    expect(response?.content).toBe('Generated title');
    expect(response?.structured).toEqual({ title: 'Generated title' });
    expect(mockSdkClient.session.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'sdk-session',
      parts: [
        expect.objectContaining({
          id: expect.stringMatching(/^part-/),
          type: 'text',
          text: 'Create a title',
        }),
      ],
      system: 'Return only the title',
      agent: 'title',
      noReply: false,
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      tools: {
        read: true,
        grep: true,
      },
      variant: 'high',
    }));
  });

  it('throws a structured assistant error returned by SDK prompt', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('sdk-session');
    mockSdkClient.session.prompt.mockResolvedValue({
      info: {
        id: 'assistant-err',
        sessionID: 'sdk-session',
        role: 'assistant',
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
    });

    await expect(service.requestAssistantResponse('Create a title', {
      sessionId: 'sdk-session',
      provider: 'alibaba',
      model: 'qwen-plus',
    })).rejects.toThrow('Incorrect API key provided. (HTTP 401)');
  });

  it('normalizes raw SDK prompt transport failures through the shared facade seam', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('sdk-session');
    mockSdkClient.session.prompt.mockRejectedValue({
      data: {
        message: 'Rate limit hit',
        statusCode: 429,
      },
    });

    await expect(service.requestAssistantResponse('Create a title', {
      sessionId: 'sdk-session',
      provider: 'alibaba',
      model: 'qwen-plus',
    })).rejects.toThrow('Rate limit hit (HTTP 429)');
  });

  it('runs a real provider probe in a temporary session and cleans it up', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.create.mockResolvedValue({
      id: 'probe-session',
      title: 'Provider probe: alibaba',
      time: { created: 1, updated: 1 },
    });
    mockSdkClient.session.prompt.mockResolvedValue({
      info: {
        id: 'assistant-ok',
        sessionID: 'probe-session',
        role: 'assistant',
        time: { created: 1234567890 },
      },
      parts: [
        {
          id: 'part-1',
          sessionID: 'probe-session',
          messageID: 'assistant-ok',
          type: 'text',
          text: 'OK',
        },
      ],
    });
    mockSdkClient.session.delete.mockResolvedValue(undefined);

    await expect(service.probeProviderResponse('alibaba', 'qwen-plus')).resolves.toEqual({
      providerId: 'alibaba',
      modelId: 'qwen-plus',
      success: true,
      responsePreview: 'OK',
    });
    expect(mockSdkClient.session.create).toHaveBeenCalledWith({
      title: 'Provider probe: alibaba',
    });
    expect(mockSdkClient.session.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'probe-session',
      model: {
        providerID: 'alibaba',
        modelID: 'qwen-plus',
      },
      system: 'Connectivity probe. Reply with the single word OK.',
    }));
    expect(mockSdkClient.session.delete).toHaveBeenCalledWith({
      sessionID: 'probe-session',
    });
  });

  it('returns normalized provider probe failures from the shared diagnostics seam', async () => {
    service = createServiceWithSdkFlags();
    mockSdkClient.session.create.mockResolvedValue({
      id: 'probe-session',
      title: 'Provider probe: alibaba',
      time: { created: 1, updated: 1 },
    });
    mockSdkClient.session.prompt.mockRejectedValue({
      data: {
        message: 'Rate limit hit',
        statusCode: 429,
      },
    });
    mockSdkClient.session.delete.mockResolvedValue(undefined);

    await expect(service.probeProviderResponse('alibaba', 'qwen-plus')).resolves.toEqual({
      providerId: 'alibaba',
      modelId: 'qwen-plus',
      success: false,
      error: 'Rate limit hit (HTTP 429)',
    });
    expect(mockSdkClient.session.delete).toHaveBeenCalledWith({
      sessionID: 'probe-session',
    });
  });
});

describe('OpenCodeService SDK promptAsync transport', () => {
  it('maps sendMessage through SDK promptAsync with shared prompt options', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('sdk-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'sdk-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'sdk-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', {
      sessionId: 'sdk-session',
      agent: 'title',
      noReply: true,
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      allowedTools: ['read'],
      reasoningEffort: 'medium',
    })) {
      chunks.push(chunk);
    }

    const sentParts = mockSdkClient.session.promptAsync.mock.calls[0]?.[0]?.parts;
    expect(mockSdkClient.session.promptAsync).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'sdk-session',
      parts: [
        expect.objectContaining({
          id: expect.stringMatching(/^part-/),
          type: 'text',
          text: 'Hello',
        }),
      ],
      agent: 'title',
      noReply: true,
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      tools: {
        read: true,
      },
      variant: 'medium',
    }));
    expect(Array.isArray(sentParts)).toBe(true);
    expect(chunks[0]).toEqual({ type: 'message_start' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('reuses prebuilt request parts when the send path passes stable prompt ids forward', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('sdk-session');

    const contextItem = {
      id: 'ctx-1',
      kind: 'file',
      path: 'notes/spec.md',
      label: 'spec.md',
      mime: 'text/markdown',
    } as const;
    const promptPayload = service.buildStructuredPromptSendPayload('Hello', {
      contextItems: [contextItem],
    });

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        yield {
          type: 'session.idle',
          properties: {
            sessionID: 'sdk-session',
          },
        };
      })(),
    });
    mockSdkClient.session.messages.mockResolvedValue([]);
    mockSdkClient.session.get.mockResolvedValue({
      id: 'sdk-session',
      title: 'SDK',
      time: { created: 1, updated: 1 },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', {
      sessionId: 'sdk-session',
      contextItems: [contextItem],
      messageID: promptPayload.messageID,
      requestParts: promptPayload.requestParts,
    })) {
      chunks.push(chunk);
    }

    expect(mockSdkClient.session.promptAsync).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'sdk-session',
      parts: promptPayload.requestParts,
    }));
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
  });

  it('falls back to legacy SSE when the SDK event stream fails before the first event', async () => {
    service = createServiceWithSdkFlags();
    service.setSessionId('test-session');

    mockSdkClient.session.promptAsync.mockResolvedValue({});
    mockSdkClient.event.subscribe.mockResolvedValue({
      stream: (async function* () {
        throw new Error('sdk stream failed');
        yield undefined as never;
      })(),
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          const chunks = [
            {
              done: false,
              value: new TextEncoder().encode('data: {"type":"session.idle","properties":{"sessionID":"test-session"}}\n\n'),
            },
            {
              done: true,
              value: undefined,
            },
          ];
          return {
            read: jest.fn().mockImplementation(() => Promise.resolve(chunks.shift() ?? { done: true, value: undefined })),
            cancel: jest.fn(),
            releaseLock: jest.fn(),
          };
        },
      },
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.sendMessage('Hello', { sessionId: 'test-session' })) {
      chunks.push(chunk);
    }

    expect(chunks[0]).toEqual({ type: 'message_start' });
    expect(chunks[chunks.length - 1]).toEqual({ type: 'message_stop' });
    expect(mockSdkClient.session.promptAsync).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4196/event',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});

describe('OpenCodeService SDK stream control', () => {
  it('disposes the streaming runtime before service lifecycle teardown', () => {
    service = createServiceWithSdkFlags();
    const internals = service as unknown as {
      serviceLifecycle: { dispose: () => void };
      streamingRuntime: { dispose: () => void };
    };
    const runtimeDisposeSpy = jest.spyOn(internals.streamingRuntime, 'dispose');
    const lifecycleDisposeSpy = jest.spyOn(internals.serviceLifecycle, 'dispose');

    service.dispose();

    expect(runtimeDisposeSpy).toHaveBeenCalledTimes(1);
    expect(lifecycleDisposeSpy).toHaveBeenCalledTimes(1);
    expect(runtimeDisposeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycleDisposeSpy.mock.invocationCallOrder[0],
    );
  });

  it('calls session.abort when cancelStream is invoked during an SDK stream', async () => {
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
            delta: 'Hello',
          },
        };
        await new Promise(() => {});
      })(),
    });

    const iterator = service.sendMessage('Hello', { sessionId: 'test-session' });
    await iterator.next();
    await iterator.next();

    service.cancelStream();
    await Promise.resolve();

    expect(mockSdkClient.session.abort).toHaveBeenCalledWith({
      sessionID: 'test-session',
    });

    if (iterator.return) {
      await iterator.return(undefined);
    }
  });

  it('does not call session.abort when detachStream is invoked during an SDK stream', async () => {
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
            delta: 'Hello',
          },
        };
        await new Promise(() => {});
      })(),
    });

    const iterator = service.sendMessage('Hello', { sessionId: 'test-session' });
    await iterator.next();
    await iterator.next();

    service.detachStream();
    await Promise.resolve();

    expect(mockSdkClient.session.abort).not.toHaveBeenCalled();

    if (iterator.return) {
      await iterator.return(undefined);
    }
  });
});
