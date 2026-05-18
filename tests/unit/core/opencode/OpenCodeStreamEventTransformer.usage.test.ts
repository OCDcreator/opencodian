import {
  type OpenCodeStreamEventState,
  OpenCodeStreamEventTransformer,
  type OpenCodeStreamEventTransformerHost,
} from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';

function createHost(): jest.Mocked<OpenCodeStreamEventTransformerHost> {
  return {
    observeRuntimeToolNames: jest.fn().mockReturnValue(true),
    getOpenCodeToolKind: jest.fn().mockReturnValue('builtin'),
    normalizeQuestionRequest: jest.fn().mockReturnValue(null),
    logStreamingDebug: jest.fn(),
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

function handleStepEnded(tokens: unknown) {
  return new OpenCodeStreamEventTransformer(createHost()).handleStreamingEvent(
    { type: 'session.next.step.ended', properties: { sessionID: 'test-session', tokens } as never },
    'test-session',
    createState(),
    { partTypeMap: new Map() },
  );
}

describe('OpenCodeStreamEventTransformer usage token validation', () => {
  it.each([
    { label: 'NaN', input: Number.NaN },
    { label: 'Infinity', input: Number.POSITIVE_INFINITY },
  ])('does not emit session.next.step.ended usage when input tokens are $label', ({ input }) => {
    const outcome = handleStepEnded({ input, output: 400, reasoning: 34 });

    expect(outcome.chunks.filter((chunk) => chunk.type === 'usage')).toEqual([]);
    expect(outcome.mutations).toEqual([]);
    expect(outcome.stop).toBe(false);
  });

  it('defaults non-finite output and reasoning tokens to zero', () => {
    const outcome = handleStepEnded({ input: 800, output: Number.NaN, reasoning: Number.NaN });

    expect(outcome.chunks).toContainEqual({ type: 'usage', inputTokens: 800, outputTokens: 0, sessionId: 'test-session' });
    expect(outcome.mutations).toEqual([]);
    expect(outcome.stop).toBe(false);
  });
});
