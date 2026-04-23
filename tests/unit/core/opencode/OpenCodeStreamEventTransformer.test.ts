import './OpenCodeStreamEventTransformer.streamPartHandlingSuite';

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
      mutations: [],
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
      mutations: [],
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
          always: ['notes/**'],
          tool: { messageID: 'message-1', callID: 'call-1' },
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
          always: ['notes/**'],
          tool: { messageID: 'message-1', callID: 'call-1' },
        },
      ],
      mutations: [],
      stop: false,
    });
    expect(abortOutcome).toEqual({ chunks: [], mutations: [], stop: true });
    expect(state.lastErrorMessage).toBe('Aborted');
    expect(host.logStreamingDebug).toHaveBeenCalledWith('service-session-error', {
      sessionId: 'test-session',
      errorName: 'MessageAbortedError',
      errorMessage: 'Aborted',
    });
  });
});

describe('OpenCodeStreamEventTransformer parsing helpers', () => {
  it('parses SSE buffers, infers event names, and preserves incomplete tails', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    const parsed = transformer.parseSSEEvents(
      'data: {"type":"message.part.delta","properties":{"delta":"Hi"}}\n\n'
        + 'event: custom\n'
        + 'data: {"type":"session.idle"}\n\n'
        + 'data: not-json\n\n'
        + 'data: {"type":"message.part.updated"}',
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
        {
          event: 'unknown',
          data: 'not-json',
        },
      ],
      remaining: 'data: {"type":"message.part.updated"}',
    });
  });

  it('parses valid SSE payloads and shields invalid payload chunks', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    expect(transformer.parseSSEEventPayload({
      event: 'message.part.delta',
      data: '{"type":"message.part.delta","properties":{"delta":"Hi"}}',
    })).toEqual({
      type: 'message.part.delta',
      properties: {
        delta: 'Hi',
      },
    });
    expect(transformer.parseSSEEventPayload({
      event: 'unknown',
      data: 'not-json',
    })).toBeNull();
    expect(transformer.parseSSEEventPayload({
      event: 'unknown',
      data: 'null',
    })).toBeNull();
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
      id: 'part-blank-reasoning',
      sessionID: 'test-session',
      messageID: 'assistant-1',
      type: 'reasoning',
      text: '\n',
      duration: 3,
    })).toEqual([]);

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

    expect(transformer.transformPartToChunks({
      id: 'part-task',
      sessionID: 'test-session',
      messageID: 'assistant-1',
      type: 'tool',
      callID: 'call-task',
      tool: 'task',
      state: {
        status: 'completed',
        input: { description: 'Audit routes' },
        metadata: { sessionId: 'child-session-1' },
        output: 'task_id: child-session-1\n\n<task_result>\nHidden\n</task_result>',
      },
    })).toEqual([
      {
        type: 'tool_use',
        id: 'call-task',
        name: 'task',
        kind: 'builtin',
        input: { description: 'Audit routes' },
        toolMetadata: { sessionId: 'child-session-1' },
        toolResultVisibility: 'hidden',
      },
      {
        type: 'tool_result',
        toolUseId: 'call-task',
        content: 'task_id: child-session-1\n\n<task_result>\nHidden\n</task_result>',
        isError: false,
      },
    ]);
  });
});
