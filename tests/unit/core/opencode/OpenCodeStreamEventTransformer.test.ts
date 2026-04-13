import {
  OpenCodeStreamEventTransformer,
  type OpenCodeStreamEventTransformerHost,
  type OpenCodeStreamEventState,
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

describe('OpenCodeStreamEventTransformer', () => {
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

  it('parses SSE buffers, infers event names, and preserves incomplete tails', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    const parsed = transformer.parseSSEEvents(
      'data: {\"type\":\"message.part.delta\",\"properties\":{\"delta\":\"Hi\"}}\n\n' +
      'event: custom\n' +
      'data: {\"type\":\"session.idle\"}\n\n' +
      'data: {\"type\":\"message.part.updated\"}',
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
});
