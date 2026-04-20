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

function createStreamContext() {
  return {
    partTypeMap: new Map<string, string>(),
    partMessageIdMap: new Map<string, string>(),
  };
}

function expectAssistantMessageMutation(messageID: string) {
  return {
    type: 'message.upserted',
    sessionID: 'test-session',
    messageID,
    role: 'assistant',
    createdAt: undefined,
  };
}

describe('OpenCodeStreamEventTransformer tool part mutations', () => {
  it('tracks tool updates, tool results, and known MCP tool kinds without duplicate tool_use chunks', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();
    const streamContext = createStreamContext();

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
        mutations: [
          expectAssistantMessageMutation('assistant-1'),
          {
            type: 'part.upserted',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            partID: 'part-tool-mcp',
            part: expect.objectContaining({
              id: 'part-tool-mcp',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'tool',
              tool: 'exa_search',
            }),
          },
        ],
        stop: false,
      });
      expect(duplicateOutcome).toEqual({
        chunks: [],
        mutations: [
          expectAssistantMessageMutation('assistant-1'),
          {
            type: 'part.upserted',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            partID: 'part-tool-mcp',
            part: expect.objectContaining({
              id: 'part-tool-mcp',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'tool',
              tool: 'exa_search',
            }),
          },
        ],
        stop: false,
      });
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
      mutations: [
        expectAssistantMessageMutation('assistant-1'),
        {
          type: 'part.upserted',
          sessionID: 'test-session',
          messageID: 'assistant-1',
          partID: 'part-tool-mcp',
          part: expect.objectContaining({
            id: 'part-tool-mcp',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            type: 'tool',
            tool: 'exa_search',
          }),
        },
        {
          type: 'part.completed',
          sessionID: 'test-session',
          messageID: 'assistant-1',
          partID: 'part-tool-mcp',
        },
      ],
      stop: false,
    });
  });
});

describe('OpenCodeStreamEventTransformer reasoning part mutations', () => {
  it('routes remembered reasoning deltas to thinking chunks and ignores mismatched part sessions', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

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
        mutations: [
          expectAssistantMessageMutation('assistant-1'),
          {
            type: 'part.upserted',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            partID: 'part-thinking',
            part: expect.objectContaining({
              id: 'part-thinking',
              sessionID: 'test-session',
              messageID: 'assistant-1',
              type: 'reasoning',
              duration: 2,
            }),
          },
        ],
        stop: false,
      });
      expect(deltaOutcome).toEqual({
        chunks: [{ type: 'thinking', content: 'Analyzing', partId: 'part-thinking' }],
        mutations: [
          expectAssistantMessageMutation('assistant-1'),
          {
            type: 'part.delta',
            sessionID: 'test-session',
            messageID: 'assistant-1',
            partID: 'part-thinking',
            field: 'text',
            delta: 'Analyzing',
            partType: 'reasoning',
          },
        ],
        stop: false,
      });
    expect(mismatchedOutcome).toEqual({ chunks: [], mutations: [], stop: false });
  });
});

describe('OpenCodeStreamEventTransformer text-late part mutations', () => {
  it('keeps tool-first and text-late updates under one assistant message mutation stream', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

    const toolOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-tool-1',
            sessionID: 'test-session',
            messageID: 'assistant-turn-1',
            type: 'tool',
            callID: 'tool-call-1',
            tool: 'read',
            state: {
              status: 'running',
              input: { file_path: 'docs/README.md' },
            },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const blankTextOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-text-1',
            sessionID: 'test-session',
            messageID: 'assistant-turn-1',
            type: 'text',
            text: '',
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const textDeltaOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-text-1',
          field: 'text',
          delta: 'Filled in later',
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(toolOutcome.mutations.map((mutation) => mutation.messageID)).toEqual([
      'assistant-turn-1',
      'assistant-turn-1',
    ]);
    expect(blankTextOutcome.mutations).toEqual([
      expectAssistantMessageMutation('assistant-turn-1'),
      {
        type: 'part.upserted',
        sessionID: 'test-session',
        messageID: 'assistant-turn-1',
        partID: 'part-text-1',
        part: {
          id: 'part-text-1',
          sessionID: 'test-session',
          messageID: 'assistant-turn-1',
          type: 'text',
          text: '',
        },
      },
    ]);
    expect(textDeltaOutcome).toEqual({
      chunks: [{ type: 'text', content: 'Filled in later' }],
      mutations: [
        expectAssistantMessageMutation('assistant-turn-1'),
        {
          type: 'part.delta',
          sessionID: 'test-session',
          messageID: 'assistant-turn-1',
          partID: 'part-text-1',
          field: 'text',
          delta: 'Filled in later',
          partType: 'text',
        },
      ],
      stop: false,
    });
  });
});
