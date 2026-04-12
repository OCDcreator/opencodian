import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../../src/core/types';
import {
  createQuestionTodoBackgroundTaskRefreshHosts,
  createQuestionTodoBackgroundTaskRefreshServices,
  type QuestionTodoBackgroundTaskRefreshViewHost,
} from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskRefreshHostAdapter';
import type { QuestionTodoStatusRefreshRuntime } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id = 'conversation-active',
  overrides?: Partial<Conversation>,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
    ...overrides,
  };
}

function createRuntime(
  overrides?: Partial<QuestionTodoStatusRefreshRuntime>,
): QuestionTodoStatusRefreshRuntime {
  return {
    sessionTodos: [],
    backgroundTaskLaunches: new Map(),
    backgroundTaskWaitingForFollowUp: false,
    ...overrides,
  };
}

function createViewHost(options?: {
  currentConversation?: Conversation | null;
  runtimes?: Record<string, QuestionTodoStatusRefreshRuntime | null>;
}): Mocked<QuestionTodoBackgroundTaskRefreshViewHost> {
  const currentConversation =
    options?.currentConversation ?? createConversation('conversation-active');
  const runtimes = new Map<string, QuestionTodoStatusRefreshRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-active': createRuntime(),
    }),
  );

  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
    hasIncompleteTodos: jest.fn((todos: readonly SessionTodo[]) =>
      todos.some((todo) => todo.status !== 'completed'),
    ),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    refreshTabSessionStatus: jest
      .fn()
      .mockResolvedValue({ status: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    refreshBackgroundTaskCompletionNotices: jest.fn().mockResolvedValue(undefined),
    syncTabStreamLikeState: jest.fn(),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

describe('QuestionTodoBackgroundTaskRefreshHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives the three host shapes from one shared view host', async () => {
    const runtime = createRuntime();
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHost({
      currentConversation,
      runtimes: {
        'tab-active': runtime,
      },
    });

    const hosts = createQuestionTodoBackgroundTaskRefreshHosts(viewHost);

    expect(hosts.questionTodoStatusRefreshHost.getTabRuntimeState('tab-active')).toBe(runtime);
    expect(hosts.postSyncQuestionTodoRefreshFacadeHost.getCurrentConversationSessionId()).toBe(
      'session-conversation-active',
    );
    expect(hosts.backgroundTaskPostSyncCoordinatorHost.getCurrentConversationId()).toBe(
      'conversation-active',
    );

    await hosts.questionTodoStatusRefreshHost.refreshPendingQuestionsForTab(
      'tab-active',
      'session-question',
    );
    await hosts.questionTodoStatusRefreshHost.refreshTabSessionStatus(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    await hosts.questionTodoStatusRefreshHost.refreshTabSessionTodos(
      'tab-active',
      'session-todo',
      { suppressErrors: true },
    );
    hosts.postSyncQuestionTodoRefreshFacadeHost.syncBackgroundTaskStateFromConversation(
      currentConversation,
      'tab-active',
    );
    await hosts.postSyncQuestionTodoRefreshFacadeHost.refreshBackgroundTaskCompletionNotices(
      'tab-active',
      currentConversation,
    );
    hosts.postSyncQuestionTodoRefreshFacadeHost.syncTabStreamLikeState('tab-active');
    hosts.backgroundTaskPostSyncCoordinatorHost.setCurrentConversationRevertState({
      messageID: 'assistant-1',
    });
    hosts.backgroundTaskPostSyncCoordinatorHost.setTabConversationSyncFingerprint(
      'tab-active',
      'next-fingerprint',
    );
    hosts.backgroundTaskPostSyncCoordinatorHost.markBackgroundTaskAuthoritativeSync(
      'tab-active',
      'sync-event:message.updated',
    );
    hosts.backgroundTaskPostSyncCoordinatorHost.setTabNeedsAttention('tab-active', true);

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'session-question',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-status',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-active',
      'session-todo',
      { suppressErrors: true },
    );
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      currentConversation,
      'tab-active',
    );
    expect(viewHost.refreshBackgroundTaskCompletionNotices).toHaveBeenCalledWith(
      'tab-active',
      currentConversation,
    );
    expect(viewHost.syncTabStreamLikeState).toHaveBeenCalledWith('tab-active');
    expect(viewHost.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
    });
    expect(viewHost.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-active',
      'next-fingerprint',
    );
    expect(viewHost.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-active',
      'sync-event:message.updated',
    );
    expect(viewHost.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', true);
  });

  it('wires visible sync refresh through the shared current-conversation session bridge', async () => {
    const runtime = createRuntime({
      sessionTodos: [{ id: 'todo-1', content: 'Refresh', status: 'pending' }],
    });
    const currentConversation = createConversation('conversation-active');
    const viewHost = createViewHost({
      currentConversation,
      runtimes: {
        'tab-active': runtime,
      },
    });

    const services = createQuestionTodoBackgroundTaskRefreshServices(viewHost);

    const outcome = await services.backgroundTaskPostSyncCoordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-active',
      questionSessionId: 'question-session',
      syncResult: {
        changed: true,
        fingerprint: 'next-visible-fingerprint',
        revertState: { messageID: 'assistant-visible' },
      },
    });

    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-active',
      'question-session',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-active',
      'session-conversation-active',
      { suppressErrors: true },
    );
    expect(viewHost.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-visible',
    });
    expect(viewHost.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-active',
      'next-visible-fingerprint',
    );
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });

  it('wires signal-sync refresh through the shared post-sync bundle', async () => {
    const conversation = createConversation('conversation-bg');
    const viewHost = createViewHost({
      currentConversation: createConversation('conversation-active'),
      runtimes: {
        'tab-bg': createRuntime(),
      },
    });

    const services = createQuestionTodoBackgroundTaskRefreshServices(viewHost);

    await services.backgroundTaskPostSyncCoordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
      previousFingerprint: 'old-fingerprint',
      syncResult: {
        changed: false,
        fingerprint: 'next-fingerprint',
      },
    });

    expect(viewHost.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:session.diff',
    );
    expect(viewHost.refreshPendingQuestionsForTab).toHaveBeenCalledWith(
      'tab-bg',
      'session-conversation-bg',
    );
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-bg',
    );
    expect(viewHost.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-bg',
      'session-conversation-bg',
      { suppressErrors: true },
    );
    expect(viewHost.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-bg',
      'session-conversation-bg',
      { suppressErrors: true },
    );
    expect(viewHost.refreshBackgroundTaskCompletionNotices).toHaveBeenCalledWith(
      'tab-bg',
      conversation,
    );
    expect(viewHost.syncTabStreamLikeState).toHaveBeenCalledWith('tab-bg');
    expect(viewHost.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });
});
