import type {
  ChildSessionGraph,
  ChildSessionInfo,
} from '../../../../../src/core/agents';
import type {
  ChatMessage,
  Conversation,
} from '../../../../../src/core/types';
import {
  ChildSessionGraphCoordinator,
  type ChildSessionGraphCoordinatorHost,
} from '../../../../../src/features/chat/services/ChildSessionGraphCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    openCodeSessionId: `session-${id}`,
    ...overrides,
  };
}

function createTaskMessage(
  childSessionId: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `message-${childSessionId}`,
    role: 'assistant',
    content: '',
    timestamp: 1,
    toolCalls: [
      {
        id: `tool-${childSessionId}`,
        name: 'task',
        kind: 'task',
        status: 'completed',
        input: {
          subagent_type: 'explore',
          description: `Inspect ${childSessionId}`,
        },
        toolMetadata: {
          sessionId: childSessionId,
        },
      },
    ],
    ...overrides,
  } as ChatMessage;
}

function createHost(
  overrides: Partial<Mocked<ChildSessionGraphCoordinatorHost>> = {},
): Mocked<ChildSessionGraphCoordinatorHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(null),
    getSessionChildren: jest.fn().mockResolvedValue([] as ChildSessionInfo[]),
    onGraphUpdated: jest.fn(),
    ...overrides,
  };
}

describe('ChildSessionGraphCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no conversation is active', async () => {
    const host = createHost();
    const coordinator = new ChildSessionGraphCoordinator(host);

    await expect(coordinator.refreshGraph()).resolves.toBeNull();
    expect(coordinator.getGraph()).toBeNull();
    expect(host.getSessionChildren).not.toHaveBeenCalled();
    expect(host.onGraphUpdated).not.toHaveBeenCalled();
  });

  it('returns empty graph when conversation has no task tool calls', async () => {
    const conversation = createConversation('empty', {
      messages: [{ id: 'message-1', role: 'user', content: 'hello', timestamp: 1 } as ChatMessage],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    const graph = await coordinator.refreshGraph();

    expect(graph).toEqual<ChildSessionGraph>({
      parentSessionId: conversation.openCodeSessionId as string,
      edges: [],
      orphanedSessions: [],
      orphanedSessionIds: [],
      status: 'empty',
    });
    expect(coordinator.getGraph()).toEqual(graph);
  });

  it('reconstructs edges from conversation messages', async () => {
    const conversation = createConversation('edge', {
      messages: [createTaskMessage('child-1')],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    const graph = await coordinator.refreshGraph();

    expect(graph).toMatchObject({
      parentSessionId: conversation.openCodeSessionId,
      status: 'complete',
      orphanedSessions: [],
      orphanedSessionIds: [],
      edges: [
        {
          childSessionId: 'child-1',
          subagentId: 'explore',
          description: 'Inspect child-1',
          title: 'explore · Inspect child-1',
          status: 'completed',
        },
      ],
    });
  });

  it('enriches graph with live child sessions', async () => {
    const conversation = createConversation('enriched', {
      messages: [
        createTaskMessage('child-1', {
          toolCalls: [
            {
              id: 'tool-child-1',
              name: 'task',
              kind: 'task',
              status: 'running',
              input: {},
              toolMetadata: { sessionId: 'child-1' },
            },
          ],
        }),
      ],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      getSessionChildren: jest.fn().mockResolvedValue([
        {
          id: 'child-1',
          title: 'Live child session',
          createdAt: 10,
          updatedAt: 20,
        },
      ]),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    const graph = await coordinator.refreshGraph();

    expect(graph?.edges).toEqual([
      expect.objectContaining({
        childSessionId: 'child-1',
        status: 'active',
        title: 'Live child session',
        lastUpdatedAt: 20,
      }),
    ]);
  });

  it('handles getSessionChildren failure gracefully (partial graph)', async () => {
    const conversation = createConversation('partial', {
      messages: [],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      getSessionChildren: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    const graph = await coordinator.refreshGraph();

    expect(graph).toEqual<ChildSessionGraph>({
      parentSessionId: conversation.openCodeSessionId as string,
      edges: [],
      orphanedSessions: [],
      orphanedSessionIds: [],
      status: 'empty',
    });
  });

  it('calls onGraphUpdated with the reconstructed graph', async () => {
    const conversation = createConversation('notify', {
      messages: [createTaskMessage('child-1')],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    const graph = await coordinator.refreshGraph();

    expect(host.onGraphUpdated).toHaveBeenCalledWith(graph as ChildSessionGraph);
  });

  it('clearGraph resets state', async () => {
    const conversation = createConversation('clear', {
      messages: [createTaskMessage('child-1')],
    });
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const coordinator = new ChildSessionGraphCoordinator(host);

    await coordinator.refreshGraph();
    expect(coordinator.getGraph()).not.toBeNull();

    coordinator.clearGraph();

    expect(coordinator.getGraph()).toBeNull();
  });
});
