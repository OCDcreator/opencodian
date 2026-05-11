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
    getOpenCodeToolKind: jest.fn(() => 'builtin'),
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

function createQuestionRequest() {
  return {
    id: 'question-waiting-1',
    sessionId: 'test-session',
    questions: [
      {
        header: 'Mode',
        question: 'Pick a mode',
        options: [{ label: 'Fast', description: 'Quick' }],
        multiple: false,
        custom: true,
      },
    ],
  };
}

describe('OpenCodeStreamEventTransformer question tool fallback', () => {
  it('emits question_request chunks from waiting question tool metadata', () => {
    const request = createQuestionRequest();
    const host = createHost({
      normalizeQuestionRequest: jest.fn((raw) => {
        if (
          raw
          && typeof raw === 'object'
          && (raw as { id?: unknown }).id === 'question-waiting-1'
        ) {
          return request;
        }
        return null;
      }),
    });
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-question-waiting',
            sessionID: 'test-session',
            messageID: 'assistant-question',
            type: 'tool',
            callID: 'call-question-waiting',
            tool: 'question',
            state: {
              status: 'waiting',
              input: {},
              metadata: {
                id: 'question-waiting-1',
                sessionID: 'test-session',
                questions: [
                  {
                    header: 'Mode',
                    question: 'Pick a mode',
                    options: [{ label: 'Fast', description: 'Quick' }],
                  },
                ],
              },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(outcome.chunks).toContainEqual({ type: 'question_request', request });
  });

  it('does not treat non-question waiting tool metadata as question requests', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-shell-waiting',
            sessionID: 'test-session',
            messageID: 'assistant-shell',
            type: 'tool',
            callID: 'call-shell-waiting',
            tool: 'bash',
            state: {
              status: 'waiting',
              input: { command: 'npm test' },
              metadata: {
                id: 'not-a-question',
                sessionID: 'test-session',
                questions: [{ question: 'Ignore me', header: 'Ignore' }],
              },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(host.normalizeQuestionRequest).not.toHaveBeenCalled();
    expect(outcome.chunks).not.toContainEqual(expect.objectContaining({
      type: 'question_request',
    }));
  });

  it('emits question_request chunks from transformPartToChunks for waiting question parts', () => {
    const request = createQuestionRequest();
    const host = createHost({
      normalizeQuestionRequest: jest.fn(() => request),
    });
    const transformer = new OpenCodeStreamEventTransformer(host);

    const chunks = transformer.transformPartToChunks({
      id: 'part-question-helper',
      type: 'tool',
      callID: 'call-question-helper',
      tool: 'question',
      state: {
        status: 'waiting',
        metadata: {
          id: 'question-waiting-1',
          sessionID: 'test-session',
          questions: [
            {
              header: 'Mode',
              question: 'Pick a mode',
              options: [{ label: 'Fast', description: 'Quick' }],
            },
          ],
        },
      },
    });

    expect(chunks).toContainEqual({ type: 'question_request', request });
  });
});
