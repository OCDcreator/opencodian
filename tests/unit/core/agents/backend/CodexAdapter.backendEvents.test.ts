/**
 * Real unit tests for CodexAdapter adapter-owned handling of the mapper's
 * thread-scoped backend events: goal state tracking (goal_updated /
 * goal_cleared + adapter mutations), server-side rename passthrough, and
 * thread_deleted local invalidation (session/alias eviction + in-flight
 * stream completion so the mapper's error chunk drains instead of hanging).
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockStartThread = jest.fn();
const mockStartTurn = jest.fn();
const mockSetThreadGoal = jest.fn();
let threadNotificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      startThread: mockStartThread,
      startTurn: mockStartTurn,
      setThreadGoal: mockSetThreadGoal,
      subscribeToThreadNotifications: jest.fn((_threadId: string, handler: (event: { method: string; params: unknown }) => void) => {
        threadNotificationHandler = handler;
        return { dispose: jest.fn() };
      }),
      getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

const GOAL = {
  threadId: 'thread-1',
  objective: 'Ship the feature',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 100,
  timeUsedSeconds: 5,
  createdAt: 1,
  updatedAt: 2,
};

function emit(method: string, params: Record<string, unknown>): void {
  threadNotificationHandler?.({ method, params });
}

interface StreamHandle {
  done: Promise<StreamChunk[]>;
}

function startStream(adapter: CodexAdapter, sessionId: string): StreamHandle {
  const chunks: StreamChunk[] = [];
  const done = (async () => {
    for await (const chunk of adapter.sendMessage({ sessionId, content: 'go' })) {
      chunks.push(chunk);
    }
    return chunks;
  })();
  return { done };
}

/** Give the generator time to establish its thread-notification subscription. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('CodexAdapter thread backend events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    threadNotificationHandler = null;
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockStartThread.mockResolvedValue({ id: 'thread-1' });
    mockStartTurn.mockResolvedValue({ id: 'turn-1' });
  });

  it('tracks goal state from goal_updated and goal_cleared notifications', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const stream = startStream(adapter, sessionId);
    await settle();
    emit('thread/goal/updated', { threadId: 'thread-1', goal: GOAL });
    expect(adapter.getTrackedThreadGoal(sessionId)).toEqual(GOAL);
    expect(adapter.getTrackedThreadGoal('thread-1')).toEqual(GOAL);

    emit('thread/goal/cleared', { threadId: 'thread-1' });
    expect(adapter.getTrackedThreadGoal(sessionId)).toBeNull();

    emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1' } });
    await stream.done;
    await adapter.stop();
  });

  it('records tracked goal state from its own pause mutation', async () => {
    mockSetThreadGoal.mockResolvedValue({ ...GOAL, status: 'paused' });
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await adapter.pauseThreadGoal('thread-1');

    expect(adapter.getTrackedThreadGoal('thread-1')?.status).toBe('paused');
    await adapter.stop();
  });

  it('ignores goal notifications for other threads', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const stream = startStream(adapter, sessionId);
    await settle();
    emit('thread/goal/updated', { threadId: 'thread-OTHER', goal: GOAL });
    expect(adapter.getTrackedThreadGoal('thread-1')).toBeNull();

    emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1' } });
    await stream.done;
    await adapter.stop();
  });

  it('thread_renamed passes through without local state churn', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const stream = startStream(adapter, sessionId);
    await settle();
    emit('thread/name/updated', { threadId: 'thread-1', threadName: 'Renamed conversation' });
    emit('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1' } });
    const chunks = await stream.done;

    const renameEvent = chunks.find(
      (chunk) => chunk.type === 'backend_event' && chunk.event === 'thread_renamed',
    );
    expect(renameEvent).toBeDefined();
    expect((renameEvent as { metadata?: { threadName?: string } }).metadata?.threadName).toBe('Renamed conversation');
    // The session itself stays intact after a rename.
    await expect(adapter.getSession(sessionId)).resolves.not.toBeNull();
    await adapter.stop();
  });

  it('thread_deleted invalidates the session locally and completes the in-flight stream with an error', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const stream = startStream(adapter, sessionId);
    await settle();
    emit('thread/deleted', { threadId: 'thread-1' });
    const chunks = await stream.done;

    expect(chunks.some(
      (chunk) => chunk.type === 'error' && /deleted on the server/.test(chunk.content),
    )).toBe(true);
    // Local invalidation: alias + session entry gone; local goal state dropped.
    await expect(adapter.getSession(sessionId)).resolves.toBeNull();
    expect(adapter.getTrackedThreadGoal('thread-1')).toBeNull();
    await adapter.stop();
  });
});
