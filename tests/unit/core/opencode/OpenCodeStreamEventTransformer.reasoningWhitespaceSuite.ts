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

  it('preserves a whitespace-only delta after reasoning has become visible', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

    transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-list-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-4',
            type: 'reasoning',
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    const firstLineOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-list-thinking',
          field: 'text',
          delta: '1. First step',
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const newlineOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-list-thinking',
          field: 'text',
          delta: '\n',
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const secondLineOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          partID: 'part-list-thinking',
          field: 'text',
          delta: '2. Second step',
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(firstLineOutcome.chunks).toEqual([
      { type: 'thinking', content: '1. First step', partId: 'part-list-thinking' },
    ]);
    expect(newlineOutcome.chunks).toEqual([
      { type: 'thinking', content: '\n', partId: 'part-list-thinking' },
    ]);
    expect(secondLineOutcome.chunks).toEqual([
      { type: 'thinking', content: '2. Second step', partId: 'part-list-thinking' },
    ]);
  });

  it('preserves a whitespace-only part update after reasoning has become visible', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

    const firstOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-updated-list-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-5',
            type: 'reasoning',
            text: '1. First step',
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );
    const newlineOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-updated-list-thinking',
            sessionID: 'test-session',
            messageID: 'assistant-5',
            type: 'reasoning',
            text: '1. First step\n',
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(firstOutcome.chunks).toEqual([
      { type: 'thinking', content: '1. First step', partId: 'part-updated-list-thinking' },
    ]);
    expect(newlineOutcome.chunks).toEqual([
      { type: 'thinking', content: '\n', partId: 'part-updated-list-thinking' },
    ]);
  });
});
