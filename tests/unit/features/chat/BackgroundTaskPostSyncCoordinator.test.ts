import type { Conversation } from '../../../../src/core/types';
import type { BackgroundConversationAttentionCoordinator } from '../../../../src/features/chat/services/BackgroundConversationAttentionCoordinator';
import type { BackgroundConversationPostSyncRefreshExecutor } from '../../../../src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor';
import {
  BackgroundTaskPostSyncCoordinator,
  type BackgroundTaskPostSyncCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';
import type { PostSyncQuestionTodoRefreshFacade } from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshFacade';
import type { VisibleConversationPostSyncStateCoordinator } from '../../../../src/features/chat/services/VisibleConversationPostSyncStateCoordinator';

type MockedBackgroundTaskPostSyncHost = {
  [Key in keyof BackgroundTaskPostSyncCoordinatorHost]:
    BackgroundTaskPostSyncCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundTaskPostSyncCoordinatorHost[Key];
};

type VisibleConversationRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  | 'refreshVisibleConversation'
>;
type BackgroundConversationRefreshPort = Pick<
  BackgroundConversationPostSyncRefreshExecutor,
  | 'refreshBackgroundTabConversation'
  | 'refreshSignalSyncedBackgroundConversation'
>;
type BackgroundConversationAttentionPort = Pick<
  BackgroundConversationAttentionCoordinator,
  | 'commitBackgroundTabSyncAttention'
  | 'commitSignalSyncAttention'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
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
    markBackgroundTaskAuthoritativeSync: jest.fn(),
  };
}

function createVisibleRefreshFacade(): jest.Mocked<VisibleConversationRefreshPort> {
  return {
    refreshVisibleConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createBackgroundRefreshExecutor(): jest.Mocked<BackgroundConversationRefreshPort> {
  return {
    refreshSignalSyncedBackgroundConversation: jest.fn().mockResolvedValue(undefined),
    refreshBackgroundTabConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createVisibleStateCoordinator(): jest.Mocked<VisibleConversationPostSyncStatePort> {
  return {
    commitPostSyncState: jest.fn().mockReturnValue({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    }),
  };
}

function createBackgroundAttentionCoordinator(): jest.Mocked<BackgroundConversationAttentionPort> {
  return {
    commitSignalSyncAttention: jest.fn(),
    commitBackgroundTabSyncAttention: jest.fn(),
  };
}

describe('BackgroundTaskPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes active visible-conversation state and returns an apply outcome', async () => {
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

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

    expect(refreshFacade.refreshVisibleConversation).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
    });
    expect(visibleStateCoordinator.commitPostSyncState).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: true,
        fingerprint: 'new',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });

  it('keeps indicator-only handling when visible sync no longer targets the current conversation', async () => {
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    visibleStateCoordinator.commitPostSyncState.mockReturnValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

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

    expect(refreshFacade.refreshVisibleConversation).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
    });
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });

  it('commits revert state but skips fingerprint updates when visible sync is unchanged', async () => {
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    visibleStateCoordinator.commitPostSyncState.mockReturnValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

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

    expect(refreshFacade.refreshVisibleConversation).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
    });
    expect(visibleStateCoordinator.commitPostSyncState).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: false,
        fingerprint: 'same',
        revertState: { messageID: 'assistant-3' },
      },
    });
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });

  it('orchestrates signal sync refresh and marks hidden changed tabs for attention', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

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
    expect(backgroundRefreshExecutor.refreshSignalSyncedBackgroundConversation).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: false,
    });
    expect(backgroundAttentionCoordinator.commitSignalSyncAttention).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      activeTabId: 'tab-active',
      previousFingerprint: 'old',
      syncResult: { changed: true, fingerprint: 'new' },
    });
  });

  it('skips attention changes when a signal sync is unchanged', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(backgroundRefreshExecutor.refreshSignalSyncedBackgroundConversation).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: false,
    });
    expect(backgroundAttentionCoordinator.commitSignalSyncAttention).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      activeTabId: 'tab-active',
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });
  });

  it('forces todo/status refresh and marks attention after background-tab sync changes', async () => {
    const conversation = createConversation();
    const host = createHost();
    const refreshFacade = createVisibleRefreshFacade();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      host,
      refreshFacade,
      backgroundRefreshExecutor,
      visibleStateCoordinator,
      backgroundAttentionCoordinator,
    );

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.markBackgroundTaskAuthoritativeSync).not.toHaveBeenCalled();
    expect(backgroundRefreshExecutor.refreshBackgroundTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
    });
    expect(backgroundAttentionCoordinator.commitBackgroundTabSyncAttention).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });
  });
});
