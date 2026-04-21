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
