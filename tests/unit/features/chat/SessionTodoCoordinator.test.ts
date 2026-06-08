import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  ChatMessage,
  ContentBlock,
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

function createContentBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    type: 'tool_use',
    toolId: 'block-tool-1',
    toolName: 'TaskCreate',
    toolInput: { subject: 'Explore plugin structure' },
    toolStatus: 'completed',
    toolResult: 'Task #1 created successfully: Explore plugin structure',
    ...overrides,
  };
}

function createMessageWithContentBlocks(blocks: ContentBlock[]): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    contentBlocks: blocks,
  };
}

function createFixture(options: {
  runtime?: SessionTodoCoordinatorRuntimeState | null;
  sessionId?: string | null;
  conversation?: Conversation | null;
} = {}) {
  const runtime = options.runtime === undefined ? createRuntime() : options.runtime;
  const sessionId = options.sessionId === undefined ? 'session-1' : options.sessionId;
  const conversation = options.conversation === undefined ? null : options.conversation;
  const host: Mocked<SessionTodoCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    getCurrentConversationSessionId: jest.fn().mockReturnValue(sessionId),
    getTabRuntimeState: jest.fn((tabId) => (tabId === 'tab-1' ? runtime : null)),
    getSessionIdForTab: jest.fn((tabId) => (tabId === 'tab-1' ? sessionId : null)),
    getConversationForTab: jest.fn().mockReturnValue(conversation),
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

  // ── Backend gate tests ──────────────────────────────────────────────
  // Non-OpenCode sessions must not trigger getSessionTodos / getSessionStatuses.

  it('skips getSessionTodos for non-OpenCode backend sessions', async () => {
    const { coordinator, host } = createFixture();
    host.getConversationForTab.mockReturnValue({ backend: 'claude-code' } as Conversation);

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual([]);
    expect(host.getSessionTodos).not.toHaveBeenCalled();
  });

  it('skips getSessionStatuses for non-OpenCode backend sessions', async () => {
    const { coordinator, host } = createFixture();
    host.getConversationForTab.mockReturnValue({ backend: 'claude-code' } as Conversation);

    const result = await coordinator.refreshTabSessionStatus('tab-1', 'session-1');

    expect(result).toBeNull();
    expect(host.getSessionStatuses).not.toHaveBeenCalled();
  });

  it('proceeds with getSessionTodos for OpenCode backend sessions', async () => {
    const { coordinator, host } = createFixture();
    const todos = [createTodo('todo-1')];
    host.getConversationForTab.mockReturnValue({ backend: 'opencode' } as Conversation);
    host.getSessionTodos.mockResolvedValue(todos);

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(todos);
    expect(host.getSessionTodos).toHaveBeenCalledWith('session-1');
  });

  it('proceeds with getSessionStatuses for OpenCode backend sessions', async () => {
    const { coordinator, host, runtime } = createFixture();
    const status = { type: 'busy' as const };
    host.getConversationForTab.mockReturnValue({ backend: 'opencode' } as Conversation);
    host.getSessionStatuses.mockResolvedValue({ 'session-1': status });

    const result = await coordinator.refreshTabSessionStatus('tab-1', 'session-1');

    expect(result).toEqual(status);
    expect(host.getSessionStatuses).toHaveBeenCalled();
    expect(runtime?.sessionStatus).toEqual(status);
  });

  it('treats missing backend field as opencode and proceeds with getSessionTodos', async () => {
    const { coordinator, host } = createFixture();
    const todos = [createTodo('todo-1')];
    host.getConversationForTab.mockReturnValue({} as Conversation);
    host.getSessionTodos.mockResolvedValue(todos);

    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(todos);
    expect(host.getSessionTodos).toHaveBeenCalledWith('session-1');
  });

  // ── Streaming todo snapshot path (OpenCode TodoWrite) ────────────────
  // The coordinator's applyStreamingTodoSnapshotFromTool handles todowrite
  // tool calls for any backend. For OpenCode, these fire from real TodoWrite
  // tool traffic. For Claude Code, TodoWrite is NOT available at runtime
  // (Claude uses TaskCreate/TaskUpdate/TaskList/TaskGet/TaskOutput/TaskStop),
  // so these snapshots never arrive from real Claude traffic. The tests below
  // verify coordinator behavior is correct when a todowrite snapshot IS
  // applied — regardless of whether it came from real traffic or a test fixture.
  // AgentCapability.Todos is productized for Claude Code: SessionTodoCoordinator
  // now derives task state from TaskCreate/TaskUpdate tool traffic.

  it('preserves stream-derived todo snapshots for Claude Code sessions after refresh returns early', async () => {
    const { coordinator, host, runtime } = createFixture();
    host.getConversationForTab.mockReturnValue({ backend: 'claude-code' } as Conversation);

    // 1. Apply a streaming snapshot (from todowrite tool call fixture)
    coordinator.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');
    expect(runtime?.sessionTodos).toEqual([
      { content: 'Refactor coordinator', status: 'pending', id: undefined, priority: undefined },
    ]);

    // 2. Refresh hits the backend gate — should NOT call getSessionTodos
    const result = await coordinator.refreshTabSessionTodos('tab-1', 'session-1');

    // 3. The snapshot is preserved (not overwritten)
    expect(result).toEqual([]);
    expect(host.getSessionTodos).not.toHaveBeenCalled();
    // The runtime still holds the stream-derived snapshot after render
    expect(runtime?.sessionTodos).toEqual([
      { content: 'Refactor coordinator', status: 'pending', id: undefined, priority: undefined },
    ]);
    expect(runtime?.sessionTodoSessionId).toBe('session-1');
  });

  it('stores stream-derived todo snapshots using Claude Code backend session ID', () => {
    const claudeSessionId = 'claude-code-abc123';
    const { coordinator, host, runtime } = createFixture({ sessionId: claudeSessionId });

    coordinator.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');

    expect(host.getSessionIdForTab).toHaveBeenCalledWith('tab-1');
    expect(runtime?.sessionTodos).toEqual([
      { content: 'Refactor coordinator', status: 'pending', id: undefined, priority: undefined },
    ]);
    expect(runtime?.sessionTodoSessionId).toBe(claudeSessionId);
  });

  // ── Claude Code Task* tool path ──────────────────────────────────────
  // TaskCreate/TaskUpdate are Claude Code's task management tools.
  // The coordinator derives SessionTodo state from their tool traffic.

  describe('Claude Code Task* tools', () => {
    it('derives a pending task from a completed TaskCreate tool call', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Explore plugin structure', description: 'Inspect src/' },
          result: 'Task #1 created successfully: Explore plugin structure',
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'Explore plugin structure', status: 'pending' },
      ]);
    });

    it('ignores TaskCreate calls that are still running (no result yet)', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Explore plugin structure' },
          status: 'running',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([]);
    });

    it('ignores TaskCreate calls without a subject', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { description: 'No subject provided' },
          result: 'Task #1 created successfully',
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([]);
    });

    it('falls back to tool-call-derived synthetic ID when result does not match pattern', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          id: 'toolcall-abc12345',
          name: 'TaskCreate',
          input: { subject: 'Task without standard result' },
          result: 'Some unexpected result format',
          status: 'completed',
        }),
        'tab-1',
      );

      // Synthetic ID is "tc_" + last 8 chars of tool call ID: "abc12345"
      expect(runtime?.sessionTodos).toEqual([
        { id: 'tc_abc12345', content: 'Task without standard result', status: 'pending' },
      ]);
    });

    it('fallback synthetic IDs never collide with real numeric task IDs', () => {
      const { coordinator, runtime } = createFixture();

      // First: real ID "1" from parsed result
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Real task #1' },
          result: 'Task #1 created successfully: Real task #1',
          status: 'completed',
        }),
        'tab-1',
      );

      // Second: fallback ID from tool call ID — "tc_" prefix ensures no collision
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          id: 'toolcall-xyz98765',
          name: 'TaskCreate',
          input: { subject: 'Fallback task' },
          result: 'Unexpected format',
          status: 'completed',
        }),
        'tab-1',
      );

      // Both tasks present, no overwrite
      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'Real task #1', status: 'pending' },
        { id: 'tc_xyz98765', content: 'Fallback task', status: 'pending' },
      ]);
    });

    it('updates an existing task status via TaskUpdate', () => {
      const { coordinator, runtime } = createFixture();

      // First: create
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Explore plugin structure' },
          result: 'Task #1 created successfully: Explore plugin structure',
          status: 'completed',
        }),
        'tab-1',
      );

      // Then: update
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskUpdate',
          input: { taskId: '1', status: 'in_progress' },
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'Explore plugin structure', status: 'in_progress' },
      ]);
    });

    it('marks a task completed via TaskUpdate', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'First task' },
          result: 'Task #1 created successfully: First task',
          status: 'completed',
        }),
        'tab-1',
      );

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Second task' },
          result: 'Task #2 created successfully: Second task',
          status: 'completed',
        }),
        'tab-1',
      );

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskUpdate',
          input: { taskId: '1', status: 'completed' },
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'First task', status: 'completed' },
        { id: '2', content: 'Second task', status: 'pending' },
      ]);
    });

    it('seeds a task entry from TaskUpdate when TaskCreate result was missed', () => {
      const { coordinator, runtime } = createFixture();

      // TaskUpdate without prior TaskCreate — seeds the entry
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskUpdate',
          input: { taskId: '3', status: 'in_progress', subject: 'Recovered task' },
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([
        { id: '3', content: 'Recovered task', status: 'in_progress' },
      ]);
    });

    it('ignores TaskUpdate without a taskId', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskUpdate',
          input: { status: 'in_progress' },
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([]);
    });

    it('clears the Claude task registry on session reset', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Will be cleared' },
          result: 'Task #1 created successfully: Will be cleared',
          status: 'completed',
        }),
        'tab-1',
      );
      expect(runtime?.sessionTodos).toHaveLength(1);

      coordinator.resetTabSessionState('tab-1', 'session-1');
      expect(runtime?.sessionTodos).toEqual([]);
    });

    it('rehydrates Claude tasks from persisted conversation messages on session reset', () => {
      const persistedConversation: Conversation = {
        id: 'conv-1',
        title: 'Claude task history',
        createdAt: 1,
        updatedAt: 1,
        backend: 'claude-code',
        backendSessionId: 'session-1',
        messages: [
          createMessageWithContentBlocks([
            createContentBlock({
              toolId: 'tc-1',
              toolName: 'TaskCreate',
              toolInput: { subject: 'Recovered on activation' },
              toolStatus: 'completed',
              toolResult: 'Task #1 created successfully: Recovered on activation',
            }),
          ]),
        ],
      };
      const { coordinator, runtime } = createFixture({
        conversation: persistedConversation,
      });

      coordinator.resetTabSessionState('tab-1', 'session-1');

      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'Recovered on activation', status: 'pending' },
      ]);
      expect(runtime?.sessionTodoSessionId).toBe('session-1');
    });

    it('ignores TaskCreate when no tab session is available', () => {
      const { coordinator, runtime } = createFixture({ sessionId: null });

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Orphan task' },
          result: 'Task #1 created successfully: Orphan task',
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([]);
    });

    it('handles multiple TaskCreate calls with distinct IDs', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'First' },
          result: 'Task #1 created successfully: First',
          status: 'completed',
        }),
        'tab-1',
      );

      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Second' },
          result: 'Task #2 created successfully: Second',
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'First', status: 'pending' },
        { id: '2', content: 'Second', status: 'pending' },
      ]);
    });

    it('does not conflate Task* tools with OpenCode todowrite tools', () => {
      const { coordinator, runtime } = createFixture();

      // Apply a todowrite snapshot
      coordinator.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');
      expect(runtime?.sessionTodos).toEqual([
        { content: 'Refactor coordinator', status: 'pending', id: undefined, priority: undefined },
      ]);

      // Apply a TaskCreate — should replace the todowrite snapshot
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Claude task' },
          result: 'Task #1 created successfully: Claude task',
          status: 'completed',
        }),
        'tab-1',
      );

      // The claude task registry flushes its own todos, overwriting the
      // todowrite snapshot. This is expected: the two paths are independent
      // and only one backend will send its respective tool traffic.
      expect(runtime?.sessionTodos).toEqual([
        { id: '1', content: 'Claude task', status: 'pending' },
      ]);
    });

    // ── Per-session isolation tests ──────────────────────────────────

    it('isolates task state between different sessions', () => {
      const runtimeA = createRuntime({ sessionTodoSessionId: 'session-alpha' });
      const runtimeB = createRuntime({ sessionTodoSessionId: 'session-beta' });

      const host: Mocked<SessionTodoCoordinatorHost> = {
        getActiveTabId: jest.fn().mockReturnValue('tab-1'),
        getCurrentConversationSessionId: jest.fn().mockReturnValue('session-alpha'),
        getTabRuntimeState: jest.fn((tabId) =>
          tabId === 'tab-1' ? runtimeA : tabId === 'tab-2' ? runtimeB : null,
        ),
        getSessionIdForTab: jest.fn((tabId) =>
          tabId === 'tab-1' ? 'session-alpha' : tabId === 'tab-2' ? 'session-beta' : null,
        ),
        getConversationForTab: jest.fn().mockReturnValue(null),
        hasMatchingPersistentAssistantNoticeMessage: jest.fn().mockReturnValue(false),
        appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
        getSessionTodos: jest.fn().mockResolvedValue([]),
        getSessionStatuses: jest.fn().mockResolvedValue({}),
        reconcileBackgroundTaskLiveSignals: jest.fn(),
      };
      const coordinator = new SessionTodoCoordinator(host);

      // Tab 1 / session-alpha: create task
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Alpha task' },
          result: 'Task #1 created successfully: Alpha task',
          status: 'completed',
        }),
        'tab-1',
      );
      expect(runtimeA.sessionTodos).toEqual([
        { id: '1', content: 'Alpha task', status: 'pending' },
      ]);

      // Tab 2 / session-beta: create different task
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Beta task' },
          result: 'Task #1 created successfully: Beta task',
          status: 'completed',
        }),
        'tab-2',
      );
      expect(runtimeB.sessionTodos).toEqual([
        { id: '1', content: 'Beta task', status: 'pending' },
      ]);

      // Alpha's state is unchanged after beta's create
      expect(runtimeA.sessionTodos).toEqual([
        { id: '1', content: 'Alpha task', status: 'pending' },
      ]);
    });

    it('does not leak task state across session reset boundaries', () => {
      const runtimeA = createRuntime({ sessionTodoSessionId: 'session-alpha' });
      const runtimeB = createRuntime({ sessionTodoSessionId: 'session-beta' });

      const host: Mocked<SessionTodoCoordinatorHost> = {
        getActiveTabId: jest.fn().mockReturnValue('tab-1'),
        getCurrentConversationSessionId: jest.fn().mockReturnValue('session-alpha'),
        getTabRuntimeState: jest.fn((tabId) =>
          tabId === 'tab-1' ? runtimeA : tabId === 'tab-2' ? runtimeB : null,
        ),
        getSessionIdForTab: jest.fn((tabId) =>
          tabId === 'tab-1' ? 'session-alpha' : tabId === 'tab-2' ? 'session-beta' : null,
        ),
        getConversationForTab: jest.fn().mockReturnValue(null),
        hasMatchingPersistentAssistantNoticeMessage: jest.fn().mockReturnValue(false),
        appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
        getSessionTodos: jest.fn().mockResolvedValue([]),
        getSessionStatuses: jest.fn().mockResolvedValue({}),
        reconcileBackgroundTaskLiveSignals: jest.fn(),
      };
      const coordinator = new SessionTodoCoordinator(host);

      // Both sessions create tasks
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Alpha task' },
          result: 'Task #1 created successfully: Alpha task',
          status: 'completed',
        }),
        'tab-1',
      );
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Beta task' },
          result: 'Task #1 created successfully: Beta task',
          status: 'completed',
        }),
        'tab-2',
      );

      // Reset session-alpha only
      coordinator.resetTabSessionState('tab-1', 'session-alpha');
      expect(runtimeA.sessionTodos).toEqual([]);
      // session-beta should be unaffected
      expect(runtimeB.sessionTodos).toEqual([
        { id: '1', content: 'Beta task', status: 'pending' },
      ]);
    });

    it('preserves alpha task state when beta session is reset', () => {
      const runtimeA = createRuntime({ sessionTodoSessionId: 'session-alpha' });
      const runtimeB = createRuntime({ sessionTodoSessionId: 'session-beta' });

      const host: Mocked<SessionTodoCoordinatorHost> = {
        getActiveTabId: jest.fn().mockReturnValue('tab-1'),
        getCurrentConversationSessionId: jest.fn().mockReturnValue('session-alpha'),
        getTabRuntimeState: jest.fn((tabId) =>
          tabId === 'tab-1' ? runtimeA : tabId === 'tab-2' ? runtimeB : null,
        ),
        getSessionIdForTab: jest.fn((tabId) =>
          tabId === 'tab-1' ? 'session-alpha' : tabId === 'tab-2' ? 'session-beta' : null,
        ),
        getConversationForTab: jest.fn().mockReturnValue(null),
        hasMatchingPersistentAssistantNoticeMessage: jest.fn().mockReturnValue(false),
        appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
        getSessionTodos: jest.fn().mockResolvedValue([]),
        getSessionStatuses: jest.fn().mockResolvedValue({}),
        reconcileBackgroundTaskLiveSignals: jest.fn(),
      };
      const coordinator = new SessionTodoCoordinator(host);

      // Alpha creates task
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Alpha task' },
          result: 'Task #1 created successfully: Alpha task',
          status: 'completed',
        }),
        'tab-1',
      );

      // Reset beta session — alpha should be untouched
      coordinator.resetTabSessionState('tab-2', 'session-beta');
      expect(runtimeA.sessionTodos).toEqual([
        { id: '1', content: 'Alpha task', status: 'pending' },
      ]);
    });
  });

  // ── Rehydration from persisted message history ────────────────────────
  // After conversation reload, contentBlocks in stored messages contain
  // historical TaskCreate/TaskUpdate tool calls. rehydrateClaudeTasksFromMessages
  // rebuilds the in-memory claudeTaskSessionStates so subsequent turns work.

  describe('rehydrateClaudeTasksFromMessages', () => {
    it('rebuilds task state from persisted contentBlocks with TaskCreate + TaskUpdate', () => {
      const { coordinator, runtime } = createFixture();

      const messages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolId: 'tc-1',
            toolName: 'TaskCreate',
            toolInput: { subject: 'Explore structure' },
            toolStatus: 'completed',
            toolResult: 'Task #1 created successfully: Explore structure',
          }),
          createContentBlock({
            toolId: 'tc-2',
            toolName: 'TaskCreate',
            toolInput: { subject: 'Implement feature' },
            toolStatus: 'completed',
            toolResult: 'Task #2 created successfully: Implement feature',
          }),
        ]),
        createMessageWithContentBlocks([
          createContentBlock({
            toolId: 'tc-3',
            toolName: 'TaskUpdate',
            toolInput: { taskId: '1', status: 'in_progress' },
            toolStatus: 'completed',
          }),
        ]),
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);

      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Explore structure', status: 'in_progress' },
        { id: '2', content: 'Implement feature', status: 'pending' },
      ]);
    });

    it('enables post-reload TaskUpdate to work on rehydrated state', () => {
      const { coordinator, runtime } = createFixture();

      // Simulate reload: rehydrate from persisted messages
      const messages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolId: 'tc-1',
            toolName: 'TaskCreate',
            toolInput: { subject: 'Initial task' },
            toolStatus: 'completed',
            toolResult: 'Task #1 created successfully: Initial task',
          }),
        ]),
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);
      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Initial task', status: 'pending' },
      ]);

      // Now a new turn arrives with only TaskUpdate (the real blocker scenario)
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskUpdate',
          input: { taskId: '1', status: 'completed' },
          status: 'completed',
        }),
        'tab-1',
      );

      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Initial task', status: 'completed' },
      ]);
    });

    it('skips rehydration when session already has task entries (live streaming)', () => {
      const { coordinator, runtime } = createFixture();

      // Live streaming already populated the registry
      coordinator.applyStreamingTodoSnapshotFromTool(
        createToolCall({
          name: 'TaskCreate',
          input: { subject: 'Live task' },
          result: 'Task #1 created successfully: Live task',
          status: 'completed',
        }),
        'tab-1',
      );
      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Live task', status: 'pending' },
      ]);

      // Rehydration should NOT overwrite the live state
      const messages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolId: 'tc-old',
            toolName: 'TaskCreate',
            toolInput: { subject: 'Old task from storage' },
            toolStatus: 'completed',
            toolResult: 'Task #1 created successfully: Old task from storage',
          }),
        ]),
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);

      // Live state preserved, not overwritten by stale storage
      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Live task', status: 'pending' },
      ]);
    });

    it('handles empty messages without errors', () => {
      const { coordinator, runtime } = createFixture();

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', []);

      expect(runtime.sessionTodos).toEqual([]);
    });

    it('does nothing when no session is available for the tab', () => {
      const { coordinator, runtime } = createFixture({ sessionId: null });

      const messages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolName: 'TaskCreate',
            toolInput: { subject: 'Orphan task' },
            toolResult: 'Task #1 created successfully: Orphan task',
          }),
        ]),
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);

      expect(runtime.sessionTodos).toEqual([]);
    });

    it('preserves session isolation after rehydration', () => {
      const runtimeA = createRuntime({ sessionTodoSessionId: 'session-alpha' });
      const runtimeB = createRuntime({ sessionTodoSessionId: 'session-beta' });

      const host: Mocked<SessionTodoCoordinatorHost> = {
        getActiveTabId: jest.fn().mockReturnValue('tab-1'),
        getCurrentConversationSessionId: jest.fn().mockReturnValue('session-alpha'),
        getTabRuntimeState: jest.fn((tabId) =>
          tabId === 'tab-1' ? runtimeA : tabId === 'tab-2' ? runtimeB : null,
        ),
        getSessionIdForTab: jest.fn((tabId) =>
          tabId === 'tab-1' ? 'session-alpha' : tabId === 'tab-2' ? 'session-beta' : null,
        ),
        getConversationForTab: jest.fn().mockReturnValue(null),
        hasMatchingPersistentAssistantNoticeMessage: jest.fn().mockReturnValue(false),
        appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
        getSessionTodos: jest.fn().mockResolvedValue([]),
        getSessionStatuses: jest.fn().mockResolvedValue({}),
        reconcileBackgroundTaskLiveSignals: jest.fn(),
      };
      const coordinator = new SessionTodoCoordinator(host);

      // Rehydrate session-alpha
      const alphaMessages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolName: 'TaskCreate',
            toolInput: { subject: 'Alpha task' },
            toolResult: 'Task #1 created successfully: Alpha task',
          }),
        ]),
      ];
      coordinator.rehydrateClaudeTasksFromMessages('tab-1', alphaMessages);

      expect(runtimeA.sessionTodos).toEqual([
        { id: '1', content: 'Alpha task', status: 'pending' },
      ]);

      // Rehydrate session-beta with different data
      const betaMessages: ChatMessage[] = [
        createMessageWithContentBlocks([
          createContentBlock({
            toolName: 'TaskCreate',
            toolInput: { subject: 'Beta task' },
            toolResult: 'Task #1 created successfully: Beta task',
          }),
        ]),
      ];
      coordinator.rehydrateClaudeTasksFromMessages('tab-2', betaMessages);

      expect(runtimeB.sessionTodos).toEqual([
        { id: '1', content: 'Beta task', status: 'pending' },
      ]);

      // Alpha unchanged after beta rehydration
      expect(runtimeA.sessionTodos).toEqual([
        { id: '1', content: 'Alpha task', status: 'pending' },
      ]);
    });

    it('falls back to toolCalls array when contentBlocks are absent', () => {
      const { coordinator, runtime } = createFixture();

      const messages: ChatMessage[] = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolCalls: [
            {
              id: 'tc-1',
              name: 'TaskCreate',
              input: { subject: 'Fallback task' },
              status: 'completed',
              result: 'Task #1 created successfully: Fallback task',
            },
          ],
        },
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);

      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Fallback task', status: 'pending' },
      ]);
    });

    it('ignores non-Task* tool_use contentBlocks', () => {
      const { coordinator, runtime } = createFixture();

      const messages: ChatMessage[] = [
        createMessageWithContentBlocks([
          {
            type: 'tool_use',
            toolId: 'tc-bash',
            toolName: 'Bash',
            toolInput: { command: 'ls' },
            toolStatus: 'completed',
            toolResult: 'file1.txt\nfile2.txt',
          },
          createContentBlock({
            toolId: 'tc-1',
            toolName: 'TaskCreate',
            toolInput: { subject: 'Only task entry' },
            toolStatus: 'completed',
            toolResult: 'Task #1 created successfully: Only task entry',
          }),
        ]),
      ];

      coordinator.rehydrateClaudeTasksFromMessages('tab-1', messages);

      expect(runtime.sessionTodos).toEqual([
        { id: '1', content: 'Only task entry', status: 'pending' },
      ]);
    });
  });
});
