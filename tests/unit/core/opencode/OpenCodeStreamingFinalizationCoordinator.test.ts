import type { Message, Part } from '../../../../src/core/opencode/OpenCodeSessionLifecycleCoordinator';
import type { OpenCodeStreamEventState } from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';
import {
  OpenCodeStreamingFinalizationCoordinator,
  type OpenCodeStreamingFinalizationCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeStreamingFinalizationCoordinator';

function createHost(
  overrides: Partial<OpenCodeStreamingFinalizationCoordinatorHost> = {},
): jest.Mocked<OpenCodeStreamingFinalizationCoordinatorHost> {
  return {
    delay: jest.fn().mockResolvedValue(undefined),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<OpenCodeStreamingFinalizationCoordinatorHost>;
}

function createStreamingState(overrides: Partial<OpenCodeStreamEventState> = {}): OpenCodeStreamEventState {
  return {
    lastContent: '',
    lastErrorMessage: null,
    processedToolIds: new Set<string>(),
    toolInputSnapshots: new Map(),
    reasoningTextSnapshots: new Map(),
    debugChunkSequence: 0,
    lastTextDelta: null,
    ...overrides,
  };
}

function createAssistantMessage(
  id: string,
  overrides: Partial<Message> = {},
  parts: Part[] = [],
): { info: Message; parts: Part[] } {
  return {
    info: {
      id,
      sessionID: 'test-session',
      role: 'assistant',
      providerID: 'openai',
      modelID: 'gpt-5',
      time: { created: 1234567890 },
      ...overrides,
    } as Message,
    parts,
  };
}

describe('OpenCodeStreamingFinalizationCoordinator assistant tail recovery', () => {
  it('returns empty chunks when no assistant message exists', async () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ type: 'message_stop' }]);
  });

  it('recovers text delta from assistant tail', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-1',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Hello world',
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({ lastContent: 'Hello' }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text', content: ' world' },
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('recovers reasoning chunks from assistant tail', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'reasoning',
            text: 'Thinking process',
            time: { start: 1_000, end: 3_000 },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'thinking',
        content: 'Thinking process',
        partId: 'part-thinking',
        durationSeconds: 2,
      },
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('recovers tool use and result chunks from assistant tail', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-tool',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            callID: 'call-1',
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: 'test.md' },
              output: 'File content',
            },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'tool_use',
        id: 'call-1',
        name: 'read',
        input: { file_path: 'test.md' },
      },
      {
        type: 'tool_result',
        toolUseId: 'call-1',
        content: 'File content',
        isError: false,
      },
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('filters by promptMessageId to find the correct assistant', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'user-first',
            sessionID: 'test-session',
            role: 'user',
            time: { created: 1234567880 },
          },
          parts: [],
        },
        createAssistantMessage('assistant-first', { parentID: 'user-first' }, [
          {
            id: 'part-first',
            sessionID: 'test-session',
            messageID: 'assistant-first',
            type: 'text',
            text: 'First response',
          },
        ]),
        {
          info: {
            id: 'user-second',
            sessionID: 'test-session',
            role: 'user',
            time: { created: 1234567890 },
          },
          parts: [],
        },
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
      'user-second',
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ type: 'message_stop' }]);
  });

  it('retries assistant tail lookup when prompt-scoped match is not immediately available', async () => {
    const host = createHost({
      getSessionMessages: jest.fn()
        .mockResolvedValueOnce([
          {
            info: {
              id: 'user-first',
              sessionID: 'test-session',
              role: 'user',
              time: { created: 1234567880 },
            },
            parts: [],
          },
          createAssistantMessage('assistant-first', { parentID: 'user-first' }, [
            {
              id: 'part-first',
              sessionID: 'test-session',
              messageID: 'assistant-first',
              type: 'text',
              text: 'First response',
            },
          ]),
          {
            info: {
              id: 'user-second',
              sessionID: 'test-session',
              role: 'user',
              time: { created: 1234567890 },
            },
            parts: [],
          },
        ])
        .mockResolvedValueOnce([
          {
            info: {
              id: 'user-first',
              sessionID: 'test-session',
              role: 'user',
              time: { created: 1234567880 },
            },
            parts: [],
          },
          createAssistantMessage('assistant-first', { parentID: 'user-first' }, [
            {
              id: 'part-first',
              sessionID: 'test-session',
              messageID: 'assistant-first',
              type: 'text',
              text: 'First response',
            },
          ]),
          {
            info: {
              id: 'user-second',
              sessionID: 'test-session',
              role: 'user',
              time: { created: 1234567890 },
            },
            parts: [],
          },
          createAssistantMessage('assistant-second', { parentID: 'user-second' }, [
            {
              id: 'part-second',
              sessionID: 'test-session',
              messageID: 'assistant-second',
              type: 'text',
              text: 'Second response',
            },
          ]),
        ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
      'user-second',
    )) {
      chunks.push(chunk);
    }

    expect(host.getSessionMessages).toHaveBeenCalledTimes(2);
    expect(host.delay).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([
      { type: 'text', content: 'Second response' },
      {
        type: 'message_metadata',
        messageId: 'assistant-second',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingFinalizationCoordinator error handling', () => {
  it('emits error chunk for structured assistant error when stream had no content', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-error', {
          error: {
            data: {
              message: 'Rate limit hit',
              statusCode: 429,
            },
          },
        }),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'error', content: 'Rate limit hit (HTTP 429)' },
      {
        type: 'message_metadata',
        messageId: 'assistant-error',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('does not emit duplicate error when stream already emitted one', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-error', {
          error: {
            data: {
              message: 'Rate limit hit',
              statusCode: 429,
            },
          },
        }),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({ lastErrorMessage: 'Rate limit hit (HTTP 429)' }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-error',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('does not emit error when stream has content', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-error', {
          error: {
            data: {
              message: 'Rate limit hit',
              statusCode: 429,
            },
          },
        }),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({ lastContent: 'Some content' }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-error',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingFinalizationCoordinator trailing content deduplication', () => {
  it('skips text parts already fully emitted in the stream', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-1',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Hello world',
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({ lastContent: 'Hello world' }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('skips reasoning parts already fully emitted in the stream without duration', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'reasoning',
            text: 'Thinking process',
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({
        reasoningTextSnapshots: new Map([['part-thinking', 'Thinking process']]),
      }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('emits empty reasoning chunk with duration even when text was already emitted', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'reasoning',
            text: 'Thinking process',
            time: { start: 1_000, end: 3_000 },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({
        reasoningTextSnapshots: new Map([['part-thinking', 'Thinking process']]),
      }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'thinking',
        content: '',
        partId: 'part-thinking',
        durationSeconds: 2,
      },
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });

  it('skips tool parts already processed in the stream', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-1', {}, [
          {
            id: 'part-tool',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            callID: 'call-1',
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: 'test.md' },
              output: 'File content',
            },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState({
        processedToolIds: new Set(['call-1', 'call-1_result']),
        toolInputSnapshots: new Map([['call-1', '{"file_path":"test.md"}']]),
      }),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-1',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingFinalizationCoordinator mixed content recovery', () => {
  it('recovers text, reasoning, and tool chunks in correct order', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-mixed', {}, [
          {
            id: 'part-text',
            sessionID: 'test-session',
            messageID: 'assistant-mixed',
            type: 'text',
            text: 'Let me think',
          },
          {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-mixed',
            type: 'reasoning',
            text: 'Need to read the file',
            time: { start: 1_000, end: 2_500 },
          },
          {
            id: 'part-tool',
            sessionID: 'test-session',
            messageID: 'assistant-mixed',
            type: 'tool',
            callID: 'call-read',
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: 'docs/spec.md' },
              output: 'Spec loaded',
            },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text', content: 'Let me think' },
      {
        type: 'thinking',
        content: 'Need to read the file',
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
        messageId: 'assistant-mixed',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingFinalizationCoordinator structured output filtering', () => {
  it('skips internal structured output tools', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-structured', {}, [
          {
            id: 'part-structured',
            sessionID: 'test-session',
            messageID: 'assistant-structured',
            type: 'tool',
            callID: 'call-structured',
            tool: '__structured__output__',
            state: {
              status: 'completed',
              input: { schema: '{}' },
              output: '{}',
            },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      {
        type: 'message_metadata',
        messageId: 'assistant-structured',
        timestamp: 1234567890,
        modelId: 'openai/gpt-5',
      },
      { type: 'message_stop' },
    ]);
  });
});

describe('OpenCodeStreamingFinalizationCoordinator tool metadata', () => {
  it('includes toolMetadata.sessionId when present in state', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        createAssistantMessage('assistant-tool-meta', {}, [
          {
            id: 'part-tool',
            sessionID: 'test-session',
            messageID: 'assistant-tool-meta',
            type: 'tool',
            callID: 'call-task',
            tool: 'task',
            state: {
              status: 'completed',
              input: { description: 'Do something' },
              output: 'Done',
              metadata: { sessionId: 'child-session-123' },
            },
          },
        ]),
      ]),
    });
    const coordinator = new OpenCodeStreamingFinalizationCoordinator(host);
    const chunks: unknown[] = [];

    for await (const chunk of coordinator.finishStreamingResponse(
      'test-session',
      createStreamingState(),
    )) {
      chunks.push(chunk);
    }

    const toolUseChunk = chunks.find((c) => (c as { type?: string }).type === 'tool_use');
    expect(toolUseChunk).toEqual({
      type: 'tool_use',
      id: 'call-task',
      name: 'task',
      input: { description: 'Do something' },
      toolMetadata: { sessionId: 'child-session-123' },
      toolResultVisibility: 'hidden',
    });
  });
});
