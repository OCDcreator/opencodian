import { ChildSessionGraphService } from '../../../../src/core/agents/ChildSessionGraphService';
import type {
  ChildSessionGraphInput,
  ChildSessionInfo,
} from '../../../../src/core/agents/types';

type MessageShape = ChildSessionGraphInput['messages'][number];
type ContentBlockShape = NonNullable<MessageShape['contentBlocks']>[number];
type ToolCallShape = NonNullable<MessageShape['toolCalls']>[number];

function makeContentBlock(
  overrides: Partial<ContentBlockShape> = {},
): ContentBlockShape {
  return {
    type: 'tool_use',
    toolKind: 'task',
    toolId: 'tool-1',
    toolName: 'task',
    toolMetadata: { sessionId: 'cs-1' },
    toolInput: {},
    ...overrides,
  };
}

function makeToolCall(
  overrides: Partial<ToolCallShape> = {},
): ToolCallShape {
  return {
    id: 'tc-1',
    name: 'task',
    input: {},
    ...overrides,
  };
}

function makeMessage(
  overrides: Partial<MessageShape> = {},
): MessageShape {
  return {
    id: 'msg-1',
    contentBlocks: [],
    toolCalls: [],
    ...overrides,
  };
}

function makeChildSession(
  overrides: Partial<ChildSessionInfo> = {},
): ChildSessionInfo {
  return {
    id: 'cs-1',
    ...overrides,
  };
}

function createService(): ChildSessionGraphService {
  return new ChildSessionGraphService();
}

describe('ChildSessionGraphService', () => {
  describe('empty input', () => {
    it('returns empty graph with status "empty" when no messages are provided', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [],
      });

      expect(graph).toEqual({
        parentSessionId: 'parent-1',
        edges: [],
        orphanedSessions: [],
        orphanedSessionIds: [],
        status: 'empty',
      });
    });

    it('returns empty graph when messages have no task tool calls', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                type: 'text',
                toolKind: undefined,
                toolId: undefined,
                toolMetadata: undefined,
              }),
            ],
            toolCalls: [
              makeToolCall({
                name: 'shell',
                kind: 'shell',
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
      expect(graph.orphanedSessions).toEqual([]);
      expect(graph.orphanedSessionIds).toEqual([]);
      expect(graph.status).toBe('empty');
    });
  });
});

describe('ChildSessionGraphService - edge reconstruction', () => {
  describe('single edge from contentBlocks', () => {
    it('recovers one task → child session edge from a tool_use contentBlock with session metadata', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            id: 'msg-7',
            contentBlocks: [
              makeContentBlock({
                toolId: 'tool-7',
                toolMetadata: { sessionId: 'child-7' },
                toolInput: {
                  subagent_type: 'explore',
                  description: 'Inspect runtime graph',
                },
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({
        parentSessionId: 'parent-1',
        parentMessageId: 'msg-7',
        toolCallId: 'tool-7',
        childSessionId: 'child-7',
        subagentId: 'explore',
        description: 'Inspect runtime graph',
        status: 'unknown',
        title: 'explore · Inspect runtime graph',
      });
    });

    it('falls back to input.prompt when input.description is missing', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                toolInput: {
                  subagent_type: 'explore',
                  prompt: 'Trace child sessions',
                },
              }),
            ],
          }),
        ],
      });

      expect(graph.edges[0]?.description).toBe('Trace child sessions');
      expect(graph.edges[0]?.title).toBe('explore · Trace child sessions');
    });

    it.each([
      ['completed', 'completed'],
      ['running', 'active'],
      ['pending', 'active'],
      ['error', 'error'],
      ['blocked', 'error'],
      [undefined, 'unknown'],
    ] as const)('maps toolStatus %p to edge status %p', (toolStatus, expectedStatus) => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolStatus })],
          }),
        ],
      });

      expect(graph.edges[0]?.status).toBe(expectedStatus);
    });
  });

  describe('multiple edges', () => {
    it('recovers multiple task edges from different messages', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            id: 'msg-1',
            contentBlocks: [makeContentBlock({ toolId: 'tool-1', toolMetadata: { sessionId: 'child-1' } })],
          }),
          makeMessage({
            id: 'msg-2',
            contentBlocks: [makeContentBlock({ toolId: 'tool-2', toolMetadata: { sessionId: 'child-2' } })],
          }),
        ],
      });

      expect(graph.edges).toHaveLength(2);
      expect(graph.edges.map((edge) => edge.childSessionId)).toEqual(['child-1', 'child-2']);
    });
  });

  describe('legacy toolCalls path', () => {
    it('recovers edges from message.toolCalls when no contentBlocks are present', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            toolCalls: [
              makeToolCall({
                id: 'tc-9',
                toolMetadata: { sessionId: 'child-9' },
                input: {
                  subagent_type: 'plan',
                  description: 'Draft implementation plan',
                },
                status: 'completed',
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toEqual([
        {
          parentSessionId: 'parent-1',
          parentMessageId: 'msg-1',
          toolCallId: 'tc-9',
          childSessionId: 'child-9',
          subagentId: 'plan',
          description: 'Draft implementation plan',
          status: 'completed',
          title: 'plan · Draft implementation plan',
        },
      ]);
    });
  });

  describe('deduplication', () => {
    it('deduplicates edges by childSessionId when the same session appears in both paths', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                toolId: 'tool-1',
                toolMetadata: { sessionId: 'child-1' },
                toolInput: { description: 'Primary edge' },
              }),
            ],
            toolCalls: [
              makeToolCall({
                id: 'tc-1',
                toolMetadata: { sessionId: 'child-1' },
                input: { description: 'Duplicate edge' },
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]?.toolCallId).toBe('tool-1');
      expect(graph.edges[0]?.description).toBe('Primary edge');
    });
  });
});

describe('ChildSessionGraphService - filtering', () => {
  describe('non-task tools ignored', () => {
    it('ignores tool_use blocks with toolKind !== "task"', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                toolKind: 'shell',
                toolName: 'shell',
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
    });

    it('ignores toolCalls with kind !== "task"', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            toolCalls: [
              makeToolCall({
                kind: 'shell',
                name: 'shell',
                toolMetadata: { sessionId: 'child-1' },
              }),
            ],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
    });
  });

  describe('missing sessionId', () => {
    it('skips blocks with no toolMetadata', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: undefined })],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
    });

    it('skips blocks where toolMetadata has no sessionId', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: { runId: 'r-1' } })],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
    });

    it('skips blocks where sessionId is empty string', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: { sessionId: '   ' } })],
          }),
        ],
      });

      expect(graph.edges).toEqual([]);
    });
  });
});

describe('ChildSessionGraphService - graph status', () => {
  describe('partial graph with orphaned sessions', () => {
    it('detects orphaned child sessions not matched to any edge', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: { sessionId: 'child-1' } })],
          }),
        ],
        childSessions: [
          makeChildSession({ id: 'child-1' }),
          makeChildSession({ id: 'child-2' }),
        ],
      });

      expect(graph.orphanedSessions).toEqual([
        { id: 'child-2' },
      ]);
      expect(graph.orphanedSessionIds).toEqual(['child-2']);
      expect(graph.status).toBe('partial');
    });

    it('orphaned sessions carry display data from ChildSessionInfo', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: { sessionId: 'child-1' } })],
          }),
        ],
        childSessions: [
          makeChildSession({ id: 'child-1', title: 'Matched session', updatedAt: 10 }),
          makeChildSession({
            id: 'child-2',
            title: 'Recovered orphan',
            createdAt: 15,
            updatedAt: 20,
          }),
        ],
      });

      expect(graph.orphanedSessions).toEqual([
        {
          id: 'child-2',
          title: 'Recovered orphan',
          createdAt: 15,
          updatedAt: 20,
        },
      ]);
      expect(graph.orphanedSessionIds).toEqual(['child-2']);
    });
  });

  describe('complete graph', () => {
    it('returns status "complete" when all children match edges', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock({ toolMetadata: { sessionId: 'child-1' } })],
          }),
        ],
        childSessions: [makeChildSession({ id: 'child-1' })],
      });

      expect(graph.orphanedSessions).toEqual([]);
      expect(graph.orphanedSessionIds).toEqual([]);
      expect(graph.status).toBe('complete');
    });

    it('enriches matched edges with child session title and updatedAt', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                toolMetadata: { sessionId: 'child-1' },
                toolInput: {},
              }),
            ],
          }),
        ],
        childSessions: [
          makeChildSession({
            id: 'child-1',
            title: 'Recovered child title',
            updatedAt: 123,
          }),
        ],
      });

      expect(graph.edges[0]?.title).toBe('Recovered child title');
      expect(graph.edges[0]?.lastUpdatedAt).toBe(123);
    });

    it('edge title takes priority over child session title', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [
              makeContentBlock({
                toolMetadata: { sessionId: 'child-1' },
                toolInput: {
                  subagent_type: 'explore',
                  description: 'Keep original title',
                },
              }),
            ],
          }),
        ],
        childSessions: [
          makeChildSession({
            id: 'child-1',
            title: 'Fallback child title',
            updatedAt: 456,
          }),
        ],
      });

      expect(graph.edges[0]?.title).toBe('explore · Keep original title');
      expect(graph.edges[0]?.lastUpdatedAt).toBe(456);
    });
  });

  describe('no child sessions provided', () => {
    it('returns empty orphanedSessionIds when childSessions is undefined', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock()],
          }),
        ],
      });

      expect(graph.orphanedSessions).toEqual([]);
      expect(graph.orphanedSessionIds).toEqual([]);
    });

    it('orphanedSessions is empty when no childSessions provided', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock()],
          }),
        ],
      });

      expect(graph.orphanedSessions).toEqual([]);
    });

    it('still returns "complete" status when edges exist but no children are provided', () => {
      const graph = createService().reconstructGraph({
        parentSessionId: 'parent-1',
        messages: [
          makeMessage({
            contentBlocks: [makeContentBlock()],
          }),
        ],
      });

      expect(graph.edges).toHaveLength(1);
      expect(graph.status).toBe('complete');
    });
  });
});
