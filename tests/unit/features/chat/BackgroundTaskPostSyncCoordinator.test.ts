import type { Conversation } from '../../../../src/core/types';
import {
  BackgroundTaskPostSyncCoordinator,
  type BackgroundTaskPostSyncCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';
import type {
  PostSyncQuestionTodoStatusRefreshOptions,
  QuestionTodoStatusRefreshCoordinator,
} from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type MockedBackgroundTaskPostSyncHost = {
  [Key in keyof BackgroundTaskPostSyncCoordinatorHost]:
    BackgroundTaskPostSyncCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundTaskPostSyncCoordinatorHost[Key];
};

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterPostSync'
>;

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

function createHost(): MockedBackgroundTaskPostSyncHost {
  return {
    getCurrentConversationId: jest.fn().mockReturnValue('conversation-1'),
    getCurrentConversationSessionId: jest.fn().mockReturnValue('session-1'),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    syncBackgroundTaskStateFromConversation: jest.fn(),
    refreshBackgroundTaskCompletionNotices: jest.fn().mockResolvedValue(undefined),
    syncTabStreamLikeState: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

function createRefreshCoordinator(): jest.Mocked<QuestionTodoStatusRefreshPort> {
  return {
    refreshAfterPostSync: jest.fn(async (options: PostSyncQuestionTodoStatusRefreshOptions) => {
      await options.afterPendingQuestionRefresh?.();
    }),
  };
}

describe('BackgroundTaskPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes active visible-conversation state and returns an apply outcome', async () => {
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

    const outcome = await coordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
      syncResult: {
        changed: true,
        fingerprint: 'new',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });

    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
    });
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
      partID: 'part-1',
    });
    expect(host.setTabConversationSyncFingerprint).toHaveBeenCalledWith('tab-active', 'new');
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });

  it('keeps indicator-only handling when visible sync no longer targets the current conversation', async () => {
    const host = createHost();
    host.getCurrentConversationId.mockReturnValue('conversation-2');
    host.getCurrentConversationSessionId.mockReturnValue('session-2');
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

    const outcome = await coordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
      syncResult: {
        changed: true,
        fingerprint: 'new',
        revertState: { messageID: 'assistant-2' },
      },
    });

    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-2',
    });
    expect(host.setCurrentConversationRevertState).not.toHaveBeenCalled();
    expect(host.setTabConversationSyncFingerprint).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });

  it('commits revert state but skips fingerprint updates when visible sync is unchanged', async () => {
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

    const outcome = await coordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
      syncResult: {
        changed: false,
        fingerprint: 'same',
        revertState: { messageID: 'assistant-3' },
      },
    });

    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
    });
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-3',
    });
    expect(host.setTabConversationSyncFingerprint).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });

  it('orchestrates signal sync refresh and marks hidden changed tabs for attention', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

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
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: false,
      afterPendingQuestionRefresh: expect.any(Function),
    });
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation, 'tab-bg');
    expect(host.refreshBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.syncTabStreamLikeState).toHaveBeenCalledWith('tab-bg');
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });

  it('skips attention changes when a signal sync is unchanged', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: false,
      afterPendingQuestionRefresh: expect.any(Function),
    });
    expect(host.refreshBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('forces todo/status refresh and marks attention after background-tab sync changes', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshCoordinator = createRefreshCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(host, refreshCoordinator);

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.markBackgroundTaskAuthoritativeSync).not.toHaveBeenCalled();
    expect(refreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      questionSessionId: 'session-1',
      todoStatusSessionId: 'session-1',
      forceTodoStatusRefresh: true,
      afterPendingQuestionRefresh: expect.any(Function),
    });
    expect(host.refreshBackgroundTaskCompletionNotices).toHaveBeenCalledWith('tab-bg', conversation);
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });
});
