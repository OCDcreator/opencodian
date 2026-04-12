import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../../src/core/types';
import {
  createSessionTodoServices,
  type SessionTodoRuntimeState,
  type SessionTodoViewHost,
} from '../../../../src/features/chat/services/SessionTodoHostAdapter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createRuntime(
  overrides: Partial<SessionTodoRuntimeState> = {},
): SessionTodoRuntimeState {
  return {
    isStreaming: false,
    sessionTodoSessionId: null,
    sessionTodos: [],
    sessionTodoFingerprint: null,
    sessionTodoLastChangedAt: null,
    sessionTodoSuppressedFingerprint: null,
    sessionTodoStaleNoticeFingerprint: null,
    todoRequestId: 0,
    sessionStatusSessionId: null,
    sessionStatus: null,
    sessionStatusLastChangedAt: null,
    statusRequestId: 0,
    backgroundTaskStartedAt: null,
    ...overrides,
  };
}

function createHost(options?: {
  activeTabId?: string | null;
  currentConversationSessionId?: string | null;
  runtimeByTab?: Record<string, SessionTodoRuntimeState>;
  conversationsByTab?: Record<string, Conversation | null>;
}) {
  const runtimeByTab = new Map<string, SessionTodoRuntimeState>(
    Object.entries(options?.runtimeByTab ?? {
      'tab-1': createRuntime(),
    }),
  );
  const conversationsByTab = new Map<string, Conversation | null>(
    Object.entries(options?.conversationsByTab ?? {
      'tab-1': null,
    }),
  );

  const host: Mocked<SessionTodoViewHost> = {
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-1'),
    getCurrentConversationSessionId: jest
      .fn()
      .mockReturnValue(options?.currentConversationSessionId ?? 'session-1'),
    getTabRuntimeState: jest.fn((tabId) => (tabId ? runtimeByTab.get(tabId) ?? null : null)),
    getSessionIdForTab: jest.fn((tabId) => {
      const runtime = tabId ? runtimeByTab.get(tabId) ?? null : null;
      return runtime?.sessionTodoSessionId ?? null;
    }),
    getConversationForTab: jest.fn((tabId) => (tabId ? conversationsByTab.get(tabId) ?? null : null)),
    hasMatchingPersistentAssistantNoticeMessage: jest.fn<
      boolean,
      [string, string, ChatMessage['noticeTone'], Conversation | null | undefined]
    >().mockReturnValue(false),
    appendPersistentAssistantNoticeMessage: jest.fn().mockResolvedValue(undefined),
    getSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    getSessionStatuses: jest.fn().mockResolvedValue({} as Record<string, SessionActivityStatus>),
    reconcileBackgroundTaskLiveSignals: jest.fn(),
  };

  return {
    host,
    runtimeByTab,
  };
}

describe('SessionTodoHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes active-tab todo state writes through the dock coordinator render bridge', () => {
    const { host } = createHost();
    const services = createSessionTodoServices(host);
    const renderSpy = jest.spyOn(services.dockCoordinator, 'render').mockImplementation(() => {});
    const todos: SessionTodo[] = [{ content: 'Investigate runtime wiring', status: 'in_progress' }];

    services.stateService.setTabSessionTodos('tab-1', todos, 'session-1');

    expect(renderSpy).toHaveBeenCalledWith('tab-1');
  });

  it('refreshes todos through the shared state service and reconcile callback', async () => {
    const runtime = createRuntime();
    const { host } = createHost({
      currentConversationSessionId: 'session-1',
      runtimeByTab: {
        'tab-1': runtime,
      },
    });
    const services = createSessionTodoServices(host);
    const todos: SessionTodo[] = [{ id: 'todo-1', content: 'Refresh snapshot', status: 'pending' }];
    host.getSessionTodos.mockResolvedValue(todos);

    const result = await services.statusRefreshService.refreshTabSessionTodos(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );

    expect(result).toEqual(todos);
    expect(host.getSessionTodos).toHaveBeenCalledWith('session-1');
    expect(runtime.sessionTodoSessionId).toBe('session-1');
    expect(runtime.sessionTodos).toEqual(todos);
    expect(host.reconcileBackgroundTaskLiveSignals).toHaveBeenCalledWith('tab-1');
  });
});
