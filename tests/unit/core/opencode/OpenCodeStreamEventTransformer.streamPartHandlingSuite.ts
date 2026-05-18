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

describe('OpenCodeStreamEventTransformer session.next tool events', () => {
  const handle = (transformer: OpenCodeStreamEventTransformer, state: OpenCodeStreamEventState, type: string, properties: Record<string, unknown>) => transformer.handleStreamingEvent(
    { type, properties: { sessionID: 'test-session', ...properties } }, 'test-session', state, createStreamContext(),
  );

  it('emits and dedupes tool chunks from session.next.tool events', () => {
    const host = createHost();
    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();

    expect(handle(transformer, state, 'session.next.tool.called', { callID: 'call-read', tool: 'read', input: { filePath: 'x' } }).chunks).toEqual([
      { type: 'tool_use', id: 'call-read', name: 'read', kind: 'builtin', input: { filePath: 'x' } },
    ]);
    expect(host.observeRuntimeToolNames).toHaveBeenCalledWith(['read']);
    expect(host.getOpenCodeToolKind).toHaveBeenCalledWith('read');
    expect(state.processedToolIds.has('call-read')).toBe(true);
    expect(state.toolInputSnapshots.get('call-read')).toBe('{"filePath":"x"}');
    expect(handle(transformer, state, 'session.next.tool.called', { callID: 'call-read', tool: 'read', input: { filePath: 'x' } }).chunks).toEqual([]);
    expect(handle(transformer, state, 'session.next.tool.success', { callID: 'call-read', content: [{ type: 'text', text: 'result' }] }).chunks).toEqual([
      { type: 'tool_result', toolUseId: 'call-read', content: 'result' },
    ]);
    expect(state.processedToolIds.has('call-read_result')).toBe(true);
    expect(handle(transformer, state, 'session.next.tool.success', { callID: 'call-read', content: [{ type: 'text', text: 'result' }] }).chunks).toEqual([]);
    expect(handle(transformer, createState(), 'session.next.tool.failed', { callID: 'call-failed', error: { type: 'unknown', message: 'fail' } }).chunks).toEqual([
      { type: 'tool_result', toolUseId: 'call-failed', content: 'fail', isError: true },
    ]);
    expect(handle(transformer, state, 'message.part.updated', { messageID: 'assistant-1', part: { id: 'part-tool', sessionID: 'test-session', messageID: 'assistant-1', type: 'tool', callID: 'call-read', tool: 'read', state: { status: 'running', input: { filePath: 'x' } } } }).chunks.filter((chunk) => chunk.type === 'tool_use')).toEqual([]);
  });
});

describe('OpenCodeStreamEventTransformer task metadata', () => {
  it('projects task session metadata into tool_use chunks', () => {
    const host = createHost({
      getOpenCodeToolKind: jest.fn(() => 'task'),
    });
    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-tool-task',
            sessionID: 'test-session',
            messageID: 'assistant-task-1',
            type: 'tool',
            callID: 'call-tool-task',
            tool: 'task',
            state: {
              status: 'running',
              input: {
                description: 'Audit routes',
              },
              metadata: {
                sessionId: 'child-session-1',
                ignored: 'value',
              },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(outcome.chunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'call-tool-task',
      name: 'task',
      kind: 'task',
      toolMetadata: {
        sessionId: 'child-session-1',
      },
    }));
  });
});

describe('OpenCodeStreamEventTransformer MCP identity stability', () => {
  it('observes tool names before classification so first-seen MCP tools emit mcp on first event', () => {
    const observedTools = new Set<string>();
    const host = createHost({
      observeRuntimeToolNames: jest.fn((toolNames: Iterable<string>) => {
        for (const name of toolNames) {
          if (typeof name === 'string') observedTools.add(name);
        }
        return true;
      }),
      getOpenCodeToolKind: jest.fn((toolName: string | undefined | null) => {
        if (!toolName) return 'unknown';
        if (observedTools.has(toolName)) return 'mcp';
        return 'custom';
      }),
    });

    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();

    const firstOutcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-first-seen-mcp',
            sessionID: 'test-session',
            messageID: 'assistant-first',
            type: 'tool',
            callID: 'call-first-seen',
            tool: 'new_mcp_tool',
            state: {
              status: 'running',
              input: { query: 'test' },
            },
          },
        },
      },
      'test-session',
      state,
      createStreamContext(),
    );

    expect(host.observeRuntimeToolNames).toHaveBeenCalledWith(['new_mcp_tool']);
    expect(firstOutcome.chunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'call-first-seen',
      name: 'new_mcp_tool',
      kind: 'mcp',
    }));
  });

  it('keeps MCP tool kind stable across running to completed lifecycle', () => {
    const observedTools = new Set<string>();
    const host = createHost({
      observeRuntimeToolNames: jest.fn((toolNames: Iterable<string>) => {
        for (const name of toolNames) {
          if (typeof name === 'string') observedTools.add(name);
        }
        return true;
      }),
      getOpenCodeToolKind: jest.fn((toolName: string | undefined | null) => {
        if (!toolName) return 'unknown';
        if (observedTools.has(toolName)) return 'mcp';
        return 'custom';
      }),
    });

    const transformer = new OpenCodeStreamEventTransformer(host);
    const state = createState();
    const streamContext = createStreamContext();

    transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-lifecycle',
            sessionID: 'test-session',
            messageID: 'assistant-lifecycle',
            type: 'tool',
            callID: 'call-lifecycle',
            tool: 'lifecycle_mcp_search',
            state: {
              status: 'running',
              input: { query: 'find docs' },
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
            id: 'part-lifecycle',
            sessionID: 'test-session',
            messageID: 'assistant-lifecycle',
            type: 'tool',
            callID: 'call-lifecycle',
            tool: 'lifecycle_mcp_search',
            state: {
              status: 'completed',
              output: 'result data',
            },
          },
        },
      },
      'test-session',
      state,
      streamContext,
    );

    const toolUseChunks = completedOutcome.chunks.filter((c) => c.type === 'tool_use');
    const toolResultChunks = completedOutcome.chunks.filter((c) => c.type === 'tool_result');
    expect(toolUseChunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'call-lifecycle',
      name: 'lifecycle_mcp_search',
      kind: 'mcp',
    }));
    expect(toolResultChunks).toContainEqual(expect.objectContaining({
      type: 'tool_result',
      toolUseId: 'call-lifecycle',
      content: 'result data',
    }));
  });

  it('preserves registry tool as custom even when observed', () => {
    const registryTools = new Set(['registry_custom_tool']);
    const observedTools = new Set<string>();
    const host = createHost({
      observeRuntimeToolNames: jest.fn((toolNames: Iterable<string>) => {
        for (const name of toolNames) {
          if (typeof name === 'string') observedTools.add(name);
        }
        return true;
      }),
      getOpenCodeToolKind: jest.fn((toolName: string | undefined | null) => {
        if (!toolName) return 'unknown';
        if (registryTools.has(toolName)) return 'custom';
        if (observedTools.has(toolName)) return 'mcp';
        return 'custom';
      }),
    });

    const transformer = new OpenCodeStreamEventTransformer(host);

    const outcome = transformer.handleStreamingEvent(
      {
        type: 'message.part.updated',
        properties: {
          sessionID: 'test-session',
          part: {
            id: 'part-registry-tool',
            sessionID: 'test-session',
            messageID: 'assistant-registry',
            type: 'tool',
            callID: 'call-registry',
            tool: 'registry_custom_tool',
            state: {
              status: 'running',
              input: { path: '/test' },
            },
          },
        },
      },
      'test-session',
      createState(),
      createStreamContext(),
    );

    expect(host.observeRuntimeToolNames).toHaveBeenCalledWith(['registry_custom_tool']);
    expect(outcome.chunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'call-registry',
      name: 'registry_custom_tool',
      kind: 'custom',
    }));
  });
});
