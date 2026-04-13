import type { Conversation } from '../../../../src/core/types';
import type { BackgroundConversationPostSyncHandoffCoordinator } from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundTaskPostSyncCoordinator,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';
import type { PostSyncQuestionTodoRefreshFacade } from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshFacade';
import type { VisibleConversationPostSyncStateCoordinator } from '../../../../src/features/chat/services/VisibleConversationPostSyncStateCoordinator';

type VisibleConversationRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  | 'refreshVisibleConversation'
>;
type BackgroundConversationPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  | 'handleBackgroundTabSyncComplete'
  | 'handleSignalSyncComplete'
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

function createVisibleRefreshFacade(): jest.Mocked<VisibleConversationRefreshPort> {
  return {
    refreshVisibleConversation: jest.fn().mockResolvedValue(undefined),
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

function createBackgroundPostSyncHandoff():
  jest.Mocked<BackgroundConversationPostSyncHandoffPort> {
  return {
    handleSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
    handleBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BackgroundTaskPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes active visible-conversation state and returns an apply outcome', async () => {
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
      backgroundPostSyncHandoff,
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
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    visibleStateCoordinator.commitPostSyncState.mockReturnValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
      backgroundPostSyncHandoff,
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
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    visibleStateCoordinator.commitPostSyncState.mockReturnValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
      backgroundPostSyncHandoff,
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

  it('delegates signal-sync post-processing to the background handoff seam', async () => {
    const conversation = createConversation();
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
      backgroundPostSyncHandoff,
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

    expect(backgroundPostSyncHandoff.handleSignalSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'old',
      syncResult: { changed: true, fingerprint: 'new' },
    });
  });

  it('delegates background-tab post-processing to the background handoff seam', async () => {
    const conversation = createConversation();
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
      backgroundPostSyncHandoff,
    );

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(backgroundPostSyncHandoff.handleBackgroundTabSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });
  });
});
