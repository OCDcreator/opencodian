import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  ChatMessage,
  Conversation,
  SessionTodo,
  ToolCallInfo,
} from '../../../../src/core/types';
import {
  SessionTodoCoordinator,
  type SessionTodoCoordinatorHost,
  type SessionTodoCoordinatorRuntimeState,
} from '../../../../src/features/chat/services/SessionTodoCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createRuntime(
  overrides: Partial<SessionTodoCoordinatorRuntimeState> = {},
): SessionTodoCoordinatorRuntimeState {
  return {
    isStreaming: false,
    sessionTodoSessionId: 'session-1',
    sessionTodos: [],
    sessionTodoFingerprint: null,
    sessionTodoLastChangedAt: null,
    sessionTodoSuppressedFingerprint: null,
    sessionTodoStaleNoticeFingerprint: null,
    todoRequestId: 0,
    sessionStatusSessionId: 'session-1',
    sessionStatus: null,
    sessionStatusLastChangedAt: null,
    statusRequestId: 0,
    backgroundTaskStartedAt: null,
    ...overrides,
  };
}

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'todowrite',
    input: {
      todos: [{ content: 'Refactor coordinator', status: 'pending' }],
    },
    status: 'completed',
    ...overrides,
  };
}

function createTodo(id: string): SessionTodo {
  return {
    id,
    content: `Task ${id}`,
    status: 'pending',
    priority: 'medium',
  };
}

function createFixture(options: {
  runtime?: SessionTodoCoordinatorRuntimeState | null;
  sessionId?: string | null;
} = {}) {
  const runtime = options.runtime === undefined ? createRuntime() : options.runtime;
  const sessionId = options.sessionId === undefined ? 'session-1' : options.sessionId;
  const host: Mocked<SessionTodoCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(sessionId),
    getTabRuntimeState: jest.fn((tabId) => (tabId === 'tab-1' ? runtime : null)),
    getSessionIdForTab: jest.fn((tabId) => (tabId === 'tab-1' ? sessionId : null)),
    getConversationForTab: jest.fn().mockReturnValue(null as Conversation | null),
    hasMatchingPersistentAssistantNoticeMessage: jest.fn<
      boolean,
      [string, string, ChatMessage['noticeTone'], Conversation | null | undefined]
    >().mockReturnValue(false),
    appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
    getSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    getSessionStatuses: jest.fn().mockResolvedValue({} as Record<string, SessionActivityStatus>),
    reconcileBackgroundTaskLiveSignals: jest.fn(),
  };
  const coordinator = new SessionTodoCoordinator(host);

  return {
    coordinator,
    host,
    runtime,
  };
}

describe('SessionTodoCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies streaming todowrite snapshots through the shared state path', () => {
    const { coordinator, runtime, host } = createFixture();

    coordinator.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');

    expect(host.getSessionIdForTab).toHaveBeenCalledWith('tab-1');
    expect(runtime?.sessionTodos).toEqual([
      { content: 'Refactor coordinator', status: 'pending', id: undefined, priority: undefined },
    ]);
    expect(runtime?.sessionTodoSessionId).toBe('session-1');
  });

  it('ignores streaming todo snapshots when no tab session is available', () => {
    const { coordinator, runtime } = createFixture({ sessionId: null });

    coordinator.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');

    expect(runtime?.sessionTodos).toEqual([]);
  });

  it('resets and clears tab session state through the coordinator boundary', () => {
    const { coordinator, runtime } = createFixture({
      runtime: createRuntime({
        sessionTodos: [createTodo('todo-1')],
        sessionStatus: { type: 'busy' },
      }),
    });

    coordinator.resetTabSessionState('tab-1', 'session-1');
    expect(runtime?.sessionTodos).toEqual([]);
    expect(runtime?.sessionStatus).toBeNull();
    expect(runtime?.sessionTodoSessionId).toBe('session-1');

    coordinator.clearTabSessionState('tab-1');
    expect(runtime?.sessionTodoSessionId).toBeNull();
    expect(runtime?.sessionStatusSessionId).toBeNull();
  });

  it('renders the todo dock and skips remote refresh when runtime is missing', async () => {
    const { coordinator, host } = createFixture({ runtime: null });
    const renderSpy = jest.spyOn(coordinator, 'render').mockImplementation(() => {});

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual([]);
    expect(renderSpy).toHaveBeenCalledWith('tab-1');
    expect(host.getSessionTodos).not.toHaveBeenCalled();
  });

  it('stores refreshed todos and reconciles background-task live signals', async () => {
    const { coordinator, host, runtime } = createFixture();
    const todos = [createTodo('todo-1')];
    host.getSessionTodos.mockResolvedValue(todos);

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(todos);
    expect(host.getSessionTodos).toHaveBeenCalledWith('session-1');
    expect(runtime?.sessionTodos).toEqual(todos);
    expect(host.reconcileBackgroundTaskLiveSignals).toHaveBeenCalledWith('tab-1');
  });

  it('returns the current todo snapshot when a refresh result becomes stale', async () => {
    const currentTodos = [createTodo('current')];
    const runtime = createRuntime({
      sessionTodos: currentTodos,
      sessionTodoSessionId: 'session-1',
    });
    const { coordinator, host } = createFixture({ runtime });
    host.getSessionTodos.mockImplementation(async () => {
      runtime.todoRequestId = 99;
      return [createTodo('stale')];
    });

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(currentTodos);
    expect(runtime.sessionTodos).toEqual(currentTodos);
    expect(host.reconcileBackgroundTaskLiveSignals).not.toHaveBeenCalled();
  });

  it('stores refreshed session status and reconciles background-task live signals', async () => {
    const { coordinator, host, runtime } = createFixture();
    const status = { type: 'busy' as const };
    host.getSessionStatuses.mockResolvedValue({ 'session-1': status });

    const result = await coordinator.refreshTabSessionStatus('tab-1', 'session-1');

    expect(result).toEqual(status);
    expect(host.getSessionStatuses).toHaveBeenCalled();
    expect(runtime?.sessionStatus).toEqual(status);
    expect(host.reconcileBackgroundTaskLiveSignals).toHaveBeenCalledWith('tab-1');
  });

  it('returns the current session status when a refresh result becomes stale', async () => {
    const currentStatus = { type: 'busy' as const };
    const runtime = createRuntime({
      sessionStatus: currentStatus,
      sessionStatusSessionId: 'session-1',
    });
    const { coordinator, host } = createFixture({ runtime });
    host.getSessionStatuses.mockImplementation(async () => {
      runtime.statusRequestId = 99;
      return { 'session-1': { type: 'idle' as const } };
    });

    const result = await coordinator.refreshTabSessionStatus('tab-1', 'session-1');

    expect(result).toEqual(currentStatus);
    expect(runtime.sessionStatus).toEqual(currentStatus);
    expect(host.reconcileBackgroundTaskLiveSignals).not.toHaveBeenCalled();
  });

  it('clears session status when the tab has no active session', async () => {
    const runtime = createRuntime({ sessionStatus: { type: 'busy' } });
    const { coordinator, host } = createFixture({ runtime });

    const result = await coordinator.refreshTabSessionStatus('tab-1', null);

    expect(result).toBeNull();
    expect(runtime.sessionStatus).toBeNull();
    expect(runtime.sessionStatusSessionId).toBeNull();
    expect(host.getSessionStatuses).not.toHaveBeenCalled();
  });
});
