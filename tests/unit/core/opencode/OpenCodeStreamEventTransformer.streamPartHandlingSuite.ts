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
    reasoningTextSnapshots: new Map<string, string>(),
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
