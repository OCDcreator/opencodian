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

describe('OpenCodeStreamEventTransformer session.next observation', () => {
  const sessionNextTypes = [
    'session.next.agent.switched', 'session.next.prompted',
    'session.next.step.started',
    'session.next.text.started', 'session.next.text.ended',
    'session.next.reasoning.started', 'session.next.reasoning.ended',
    'session.next.tool.called', 'session.next.tool.success',
  ];

  const handle = (
    transformer: OpenCodeStreamEventTransformer,
    type: string,
    properties: Record<string, unknown>,
  ) => transformer.handleStreamingEvent(
    { type, properties: { sessionID: 'test-session', ...properties } },
    'test-session',
    createState(),
    { partTypeMap: new Map() },
  );

  it.each(sessionNextTypes)('observes %s without stream output', (type) => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = handle(transformer, type, {
      callID: 'call-1',
      reasoningID: 'reasoning-1',
      text: 'redacted text',
      input: { secret: 'redacted input' },
      output: { secret: 'redacted output' },
      prompt: { text: 'redacted prompt' },
      reason: 'redacted reason',
      agent: 'build',
      finish: 'stop',
      cost: 0.01,
      tokens: { input: 1, output: 2, reasoning: 3, cache: { write: 4, read: 5 } },
    });

    expect(outcome).toEqual({ chunks: [], mutations: [], stop: false });
    expect(host.logStreamingDebug).toHaveBeenCalledWith('service-session-next-event', {
      eventType: type,
      sessionId: 'test-session',
      callID: 'call-1',
      reasoningID: 'reasoning-1',
      hasText: true,
      hasInput: true,
      tokens: { total: undefined, input: 1, output: 2, reasoning: 3, cache: { write: 4, read: 5 } },
      finish: 'stop',
      agent: 'build',
      cost: 0.01,
    });
    expect(JSON.stringify(host.logStreamingDebug.mock.calls)).not.toContain('redacted');
  });

  it('redacts unexpected token fields from session.next debug logs', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const unsafeTokens = {
      total: 10,
      input: 1,
      output: 'not-a-number',
      detail: { text: 'sensitive' },
      cache: { write: 2, read: 'hidden', detail: { text: 'cache-sensitive' } },
    } as never;

    handle(transformer, 'session.next.step.ended', { tokens: unsafeTokens });

    expect(host.logStreamingDebug).toHaveBeenCalledWith('service-session-next-event', {
      eventType: 'session.next.step.ended',
      sessionId: 'test-session',
      callID: undefined,
      reasoningID: undefined,
      hasText: false,
      hasInput: false,
      tokens: { total: 10, input: 1, output: undefined, reasoning: undefined, cache: { write: 2, read: undefined } },
      finish: undefined,
      agent: undefined,
      cost: undefined,
    });
    expect(JSON.stringify(host.logStreamingDebug.mock.calls)).not.toContain('sensitive');
    expect(JSON.stringify(host.logStreamingDebug.mock.calls)).not.toContain('not-a-number');
  });

  it('emits usage from session.next.step.ended token counts', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = handle(transformer, 'session.next.step.ended', {
      finish: 'stop',
      cost: 0.001234,
      tokens: { total: 1234, input: 800, output: 400, reasoning: 34, cache: { write: 0, read: 0 } },
    });

    expect(outcome.stop).toBe(false);
    expect(outcome.mutations).toEqual([]);
    expect(outcome.chunks).toContainEqual({ type: 'usage', inputTokens: 800, outputTokens: 434, sessionId: 'test-session' });
  });

  it('does not emit session.next.step.ended usage when tokens are invalid', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    expect(() => handle(transformer, 'session.next.step.ended', {
      tokens: { output: 400, reasoning: 34 } as never,
    })).not.toThrow();

    const outcome = handle(transformer, 'session.next.step.ended', {
      tokens: { input: '800', output: 400, reasoning: 34 } as never,
    });

    expect(outcome.chunks.filter((chunk) => chunk.type === 'usage')).toEqual([]);
    expect(outcome.mutations).toEqual([]);
    expect(outcome.stop).toBe(false);
  });

  it('keeps unknown session.next events observe-only', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = handle(transformer, 'session.next.future.event', {
      text: 'redacted text',
      input: { secret: 'redacted input' },
      usage: { input: 9, output: 9 },
    });

    expect(outcome).toEqual({ chunks: [], mutations: [], stop: false });
    expect(host.logStreamingDebug).toHaveBeenCalledWith('service-session-next-event', {
      eventType: 'session.next.future.event',
      sessionId: 'test-session',
    });
  });

  it('keeps message part delta handling unchanged', () => {
    const transformer = new OpenCodeStreamEventTransformer(createHost());

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.delta',
        properties: {
          sessionID: 'test-session',
          messageID: 'assistant-1',
          partID: 'part-text',
          field: 'text',
          delta: 'Hi',
        },
      },
      'test-session',
      createState(),
      {
        partTypeMap: new Map([['part-text', 'text']]),
        partMessageIdMap: new Map([['part-text', 'assistant-1']]),
      },
    );

    expect(outcome).toEqual({
      chunks: [{ type: 'text', content: 'Hi' }],
      mutations: [
        { type: 'message.upserted', sessionID: 'test-session', messageID: 'assistant-1', role: 'assistant', createdAt: undefined },
        { type: 'part.delta', sessionID: 'test-session', messageID: 'assistant-1', partID: 'part-text', field: 'text', delta: 'Hi', partType: 'text' },
      ],
      stop: false,
    });
  });

});

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
          sessionID: 'test-session',
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
      errorClass: expect.any(String),
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
