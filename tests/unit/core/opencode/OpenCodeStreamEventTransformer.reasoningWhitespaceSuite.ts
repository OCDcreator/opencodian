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

describe('OpenCodeStreamEventTransformer reasoning whitespace handling', () => {
  it('keeps whitespace-only reasoning parts out of visible thinking chunks', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

    const initialOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-blank-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-3',
            type: 'reasoning',
            text: '\n',
            time: { start: 1_000, end: 2_000 },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    const whitespaceDeltaOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-blank-thinking',
          field: 'text',
          delta: '  ',
        },
      },
      'test-session',
      state,
      streamContext,
    );

    const visibleDeltaOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-blank-thinking',
          field: 'text',
          delta: 'Reasoning started',
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(initialOutcome.chunks).toEqual([]);
    expect(whitespaceDeltaOutcome.chunks).toEqual([]);
    expect(visibleDeltaOutcome.chunks).toEqual([
      { type: 'thinking', content: 'Reasoning started', partId: 'part-blank-thinking' },
    ]);
  });
});
