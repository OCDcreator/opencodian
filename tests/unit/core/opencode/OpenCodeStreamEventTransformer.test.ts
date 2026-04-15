import {
  type OpenCodeStreamEventState,
  OpenCodeStreamEventTransformer,
  type OpenCodeStreamEventTransformerHost,
} from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';

function createHost(
  overrides: Partial<OpenCodeStreamEventTransformerHost> = {},
): jest.Mocked<OpenCodeStreamEventTransformerHost> {
  return {
    observeRuntimeToolNames: jest.fn().mockReturnValue(true),
    getOpenCodeToolKind: jest.fn((toolName: string | undefined | null) => (
      toolName === 'exa_search' ? 'mcp' : 'builtin'
    )),
    normalizeQuestionRequest: jest.fn().mockReturnValue(null),
    logStreamingDebug: jest.fn(),
    ...overrides,
  } as jest.Mocked<OpenCodeStreamEventTransformerHost>;
}

function createState(): OpenCodeStreamEventState {
  return {
    lastContent: '',
    lastErrorMessage: null,
    processedToolIds: new Set<string>(),
    toolInputSnapshots: new Map<string, string>(),
    debugChunkSequence: 0,
    lastTextDelta: null,
  };
}

describe('OpenCodeStreamEventTransformer event routing', () => {
  it('delegates question.asked payloads to normalized question_request chunks', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const request = {
      id: 'question-1',
      sessionId: 'test-session',
      questions: [
        {
          header: 'Mode',
          question: 'Pick a mode',
          options: [{ label: 'Fast', description: 'Quick answer' }],
          multiple: false,
          custom: true,
        },
      ],
    };
    host.normalizeQuestionRequest.mockReturnValue(request);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'question.asked',
        properties: {
          id: 'question-1',
          sessionID: 'test-session',
          questions: [
            {
              header: 'Mode',
              question: 'Pick a mode',
            },
          ],
        },
      },
      'test-session',
      createState(),
      { partTypeMap: new Map() },
    );

    expect(host.normalizeQuestionRequest).toHaveBeenCalledWith({
      id: 'question-1',
      sessionID: 'test-session',
      questions: [{ header: 'Mode', question: 'Pick a mode' }],
    });
    expect(outcome).toEqual({
      chunks: [{ type: 'question_request', request }],
      stop: false,
    });
  });

  it('emits file_edited chunks for matching file.edited events', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'file.edited',
        properties: {
          sessionID: 'test-session',
          file: 'notes/today.md',
        },
      },
      'test-session',
      createState(),
      { partTypeMap: new Map() },
    );

    expect(outcome).toEqual({
      chunks: [{ type: 'file_edited', file: 'notes/today.md' }],
      stop: false,
    });
  });

  it('keeps permission requests and aborted session errors classified correctly', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();

    const permissionOutcome = transformer.handleStreamingEvent(
      {
        type: 'permission.asked',
        properties: {
          id: 'permission-1',
          sessionID: 'test-session',
          permission: 'write',
          patterns: ['notes/**'],
          metadata: { source: 'tool' },
        },
      },
      'test-session',
      state,
      { partTypeMap: new Map() },
    );
    const abortOutcome = transformer.handleStreamingEvent(
      {
        type: 'session.error',
        properties: {
          sessionID: 'test-session',
          error: {
            name: 'MessageAbortedError',
            message: 'Aborted',
          },
        },
      },
      'test-session',
      state,
      { partTypeMap: new Map() },
    );

    expect(permissionOutcome).toEqual({
      chunks: [
        {
          type: 'permission_request',
          id: 'permission-1',
          permission: 'write',
          patterns: ['notes/**'],
          metadata: { source: 'tool' },
        },
      ],
      stop: false,
    });
    expect(abortOutcome).toEqual({ chunks: [], stop: true });
    expect(state.lastErrorMessage).toBe('Aborted');
    expect(host.logStreamingDebug).toHaveBeenCalledWith('service-session-error', {
      sessionId: 'test-session',
      errorName: 'MessageAbortedError',
      errorMessage: 'Aborted',
    });
  });
});

describe('OpenCodeStreamEventTransformer stream part handling', () => {
  it('tracks tool updates, tool results, and known MCP tool kinds without duplicate tool_use chunks', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();
    const streamContext = { partTypeMap: new Map<string, string>() };

    const runningOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          usage: { input: 3, output: 5 },
          part: {
            id: 'part-tool-mcp',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            callID: 'call-tool-mcp',
            tool: 'exa_search',
            state: {
              status: 'running',
              input: { query: 'latest docs' },
            },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const duplicateOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-tool-mcp',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            callID: 'call-tool-mcp',
            tool: 'exa_search',
            state: {
              status: 'running',
              input: { query: 'latest docs' },
            },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const completedOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-tool-mcp',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            callID: 'call-tool-mcp',
            tool: 'exa_search',
            state: {
              status: 'completed',
              output: 'Done',
            },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(host.observeRuntimeToolNames).toHaveBeenCalledWith(['exa_search']);
    expect(host.getOpenCodeToolKind).toHaveBeenCalledWith('exa_search');
    expect(runningOutcome).toEqual({
      chunks: [
        {
          type: 'usage',
          inputTokens: 3,
          outputTokens: 5,
          sessionId: 'test-session',
        },
        {
          type: 'tool_use',
          id: 'call-tool-mcp',
          name: 'exa_search',
          kind: 'mcp',
          input: { query: 'latest docs' },
        },
      ],
      stop: false,
    });
    expect(duplicateOutcome).toEqual({ chunks: [], stop: false });
    expect(completedOutcome).toEqual({
      chunks: [
        {
          type: 'tool_use',
          id: 'call-tool-mcp',
          name: 'exa_search',
          kind: 'mcp',
          input: {},
        },
        {
          type: 'tool_result',
          toolUseId: 'call-tool-mcp',
          content: 'Done',
          isError: false,
        },
      ],
      stop: false,
    });
  });

  it('routes remembered reasoning deltas to thinking chunks and ignores mismatched part sessions', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = { partTypeMap: new Map<string, string>() };

    const reasoningOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'reasoning',
            duration: 2,
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const deltaOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-thinking',
          field: 'text',
          delta: 'Analyzing',
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const mismatchedOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-other',
            sessionID: 'other-session',
            messageID: 'assistant-1',
            type: 'text',
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(reasoningOutcome).toEqual({
      chunks: [
        {
          type: 'thinking',
          content: '',
          partId: 'part-thinking',
          durationSeconds: 2,
        },
      ],
      stop: false,
    });
    expect(deltaOutcome).toEqual({
      chunks: [{ type: 'thinking', content: 'Analyzing', partId: 'part-thinking' }],
      stop: false,
    });
    expect(mismatchedOutcome).toEqual({ chunks: [], stop: false });
  });
});

describe('OpenCodeStreamEventTransformer parsing helpers', () => {
  it('parses SSE buffers, infers event names, and preserves incomplete tails', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    const parsed = transformer.parseSSEEvents(
      'data: {"type":"message.part.delta","properties":{"delta":"Hi"}}\n\n' +
      'event: custom\n' +
      'data: {"type":"session.idle"}\n\n' +
      'data: {"type":"message.part.updated"}',
    );

    expect(parsed).toEqual({
      events: [
        {
          event: 'message.part.delta',
          data: '{"type":"message.part.delta","properties":{"delta":"Hi"}}',
        },
        {
          event: 'custom',
          data: '{"type":"session.idle"}',
        },
      ],
      remaining: 'data: {"type":"message.part.updated"}',
    });
  });

  it('transforms generic event and part payloads into text, thinking, tool, and usage chunks', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const chunks = transformer.transformEventToChunks({
      properties: {
        parts: [
          {
            id: 'part-text',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Hello',
          },
          {
            id: 'part-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'reasoning',
            text: 'Let me think',
            time: {
              start: 1_000,
              end: 2_500,
            },
          },
        ],
        part: {
          id: 'part-tool',
          sessionID: 'test-session',
          messageID: 'assistant-1',
          type: 'tool',
          callID: 'call-tool-1',
          tool: 'read',
          state: {
            status: 'completed',
            output: 'Read complete',
          },
        },
        text: 'Tail',
        usage: { input: 2, output: 4 },
      },
    });

    expect(chunks).toEqual([
      { type: 'text', content: 'Hello' },
      {
        type: 'thinking',
        content: 'Let me think',
        partId: 'part-thinking',
        durationSeconds: 1.5,
      },
      {
        type: 'tool_result',
        toolUseId: 'call-tool-1',
        content: 'Read complete',
        isError: false,
      },
      { type: 'text', content: 'Tail' },
      { type: 'usage', inputTokens: 2, outputTokens: 4 },
    ]);
  });

  it('classifies text, reasoning, and tool parts when transforming chunks', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    expect(transformer.transformPartToChunks({
      id: 'part-text',
      sessionID: 'test-session',
      messageID: 'assistant-1',
      type: 'text',
      text: 'Hello',
    })).toEqual([{ type: 'text', content: 'Hello' }]);

    expect(transformer.transformPartToChunks({
      id: 'part-reasoning',
      sessionID: 'test-session',
      messageID: 'assistant-1',
      type: 'reasoning',
      text: 'Thinking',
      duration: 3,
    })).toEqual([
      {
        type: 'thinking',
        content: 'Thinking',
        partId: 'part-reasoning',
        durationSeconds: 3,
      },
    ]);

    expect(transformer.transformPartToChunks({
      id: 'part-tool',
      sessionID: 'test-session',
      messageID: 'assistant-1',
      type: 'tool',
      callID: 'call-tool',
      tool: 'exa_search',
      state: {
        status: 'completed',
        output: 'Done',
      },
    })).toEqual([
      {
        type: 'tool_result',
        toolUseId: 'call-tool',
        content: 'Done',
        isError: false,
      },
    ]);
  });
});
