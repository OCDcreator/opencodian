import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  Conversation,
  QuestionRequest,
  SessionTodo,
} from '../../../../src/core/types';
import {
  BackgroundTaskPostSyncCoordinator,
  type BackgroundTaskPostSyncCoordinatorHost,
  type BackgroundTaskPostSyncRuntime,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';

type MockedBackgroundTaskPostSyncHost = {
  [Key in keyof BackgroundTaskPostSyncCoordinatorHost]:
    BackgroundTaskPostSyncCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundTaskPostSyncCoordinatorHost[Key];
};

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
  };
}

function createTodo(status: SessionTodo['status']): SessionTodo {
  return {
    id: `todo-${status}`,
    content: 'Search docs',
    status,
    priority: 'medium',
  };
}

function createHost(options: {
  runtime?: BackgroundTaskPostSyncRuntime | null;
  hasIncompleteTodos?: boolean;
} = {}): MockedBackgroundTaskPostSyncHost {
  const runtime = options.runtime ?? { sessionTodos: [] };
  return {
    getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    hasIncompleteTodos: jest.fn().mockReturnValue(options.hasIncompleteTodos ?? false),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([] as QuestionRequest[]),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    refreshTabSessionStatus: jest.fn().mockResolvedValue({ type: 'idle' } as SessionActivityStatus),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    queueBackgroundTaskCompletionNotices: jest.fn().mockResolvedValue(undefined),
    flushQueuedBackgroundTaskCompletionNotices: jest.fn().mockResolvedValue(undefined),
    syncTabStreamLikeState: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

describe('BackgroundTaskPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orchestrates signal sync refresh and marks hidden changed tabs for attention', async () => {
    const conversation = createConversation();
    const runtime = { sessionTodos: [createTodo('pending')] };
    const host = createHost({ runtime, hasIncompleteTodos: true });
    const coordinator = new BackgroundTaskPostSyncCoordinator(host);

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'old',
      syncResult: { changed: true, fingerprint: 'new' },
    });

    expect(host.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:message.updated',
    );
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-bg', 'session-1');
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation, 'tab-bg');
    expect(host.hasIncompleteTodos).toHaveBeenCalledWith(runtime.sessionTodos);
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-bg',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-bg',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.queueBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.flushQueuedBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-bg');
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });

  it('skips todo/status refresh and attention changes when a signal sync is unchanged', async () => {
    const conversation = createConversation();
    const host = createHost();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host);

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-bg', 'session-1');
    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
    expect(host.queueBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.flushQueuedBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('refreshes todo/status and marks attention after background-tab sync changes', async () => {
    const conversation = createConversation();
    const host = createHost();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host);

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.markBackgroundTaskAuthoritativeSync).not.toHaveBeenCalled();
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-bg', 'session-1');
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-bg',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-bg',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.queueBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.flushQueuedBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });
});
