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
      chunks: [],
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

  it('backfills reasoning text from part.updated and keeps final updates deduplicated', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());
    const state = createState();
    const streamContext = createStreamContext();

    const initialOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-thinking-updated',
            sessionID: 'test-session',
            messageID: 'assistant-2',
            type: 'reasoning',
            text: 'Plan',
            time: { start: 1_000, end: 2_500 },
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
          partID: 'part-thinking-updated',
          field: 'text',
          delta: ' more',
        },
      },
      'test-session',
      state,
      streamContext,
    );

    const finalizedOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-thinking-updated',
            sessionID: 'test-session',
            messageID: 'assistant-2',
            type: 'reasoning',
            text: 'Plan more',
            time: { start: 1_000, end: 2_500 },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    expect(initialOutcome.chunks).toEqual([
      {
        type: 'thinking',
        content: 'Plan',
        partId: 'part-thinking-updated',
        durationSeconds: 1.5,
      },
    ]);
    expect(deltaOutcome.chunks).toEqual([
      { type: 'thinking', content: ' more', partId: 'part-thinking-updated' },
    ]);
    expect(finalizedOutcome.chunks).toEqual([
      {
        type: 'thinking',
        content: '',
        partId: 'part-thinking-updated',
        durationSeconds: 1.5,
      },
    ]);
  });
});
