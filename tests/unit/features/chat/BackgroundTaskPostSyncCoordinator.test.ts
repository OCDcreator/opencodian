import type { Conversation } from '../../../../src/core/types';
import type { BackgroundConversationPostSyncHandoffCoordinator } from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundTaskPostSyncCoordinator,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';
import type { VisibleConversationPostSyncCoordinator } from '../../../../src/features/chat/services/VisibleConversationPostSyncCoordinator';

type VisibleConversationPostSyncPort = Pick<
  VisibleConversationPostSyncCoordinator,
  'handleVisibleConversationSyncComplete'
>;
type BackgroundConversationPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  | 'handleBackgroundTabSyncComplete'
  | 'handleSignalSyncComplete'
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

function createVisiblePostSyncCoordinator(): jest.Mocked<VisibleConversationPostSyncPort> {
  return {
    handleVisibleConversationSyncComplete: jest.fn().mockResolvedValue({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    }),
  };
}

function createBackgroundPostSyncHandoff(): jest.Mocked<BackgroundConversationPostSyncHandoffPort> {
  return {
    handleSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
    handleBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BackgroundTaskPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates visible post-sync processing to the visible coordinator seam', async () => {
    const visiblePostSyncCoordinator = createVisiblePostSyncCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      visiblePostSyncCoordinator,
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

    expect(visiblePostSyncCoordinator.handleVisibleConversationSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
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

  it('delegates signal-sync post-processing to the background handoff seam', async () => {
    const conversation = createConversation();
    const visiblePostSyncCoordinator = createVisiblePostSyncCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      visiblePostSyncCoordinator,
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
    const visiblePostSyncCoordinator = createVisiblePostSyncCoordinator();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(
      visiblePostSyncCoordinator,
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
