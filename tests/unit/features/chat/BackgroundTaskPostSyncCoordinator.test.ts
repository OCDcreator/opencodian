import type { Conversation } from '../../../../src/core/types';
import type { BackgroundConversationPostSyncHandoffCoordinator } from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import {
  BackgroundTaskPostSyncCoordinator,
} from '../../../../src/features/chat/services/BackgroundTaskPostSyncCoordinator';

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

  it('delegates signal-sync post-processing to the background handoff seam', async () => {
    const conversation = createConversation();
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(backgroundPostSyncHandoff);

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
    const backgroundPostSyncHandoff = createBackgroundPostSyncHandoff();
    const coordinator = new BackgroundTaskPostSyncCoordinator(backgroundPostSyncHandoff);

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
