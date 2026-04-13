import type { Conversation } from '../../../../src/core/types';
import type { BackgroundConversationAttentionCoordinator } from '../../../../src/features/chat/services/BackgroundConversationAttentionCoordinator';
import type { BackgroundConversationPostSyncRefreshExecutor } from '../../../../src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
} from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import type { BackgroundConversationSignalSyncStateCoordinator } from '../../../../src/features/chat/services/BackgroundConversationSignalSyncStateCoordinator';

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
type BackgroundConversationSignalSyncStatePort = Pick<
  BackgroundConversationSignalSyncStateCoordinator,
  'commitSignalSyncState'
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

function createBackgroundRefreshExecutor(): jest.Mocked<BackgroundConversationRefreshPort> {
  return {
    refreshSignalSyncedBackgroundConversation: jest.fn().mockResolvedValue(undefined),
    refreshBackgroundTabConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createBackgroundAttentionCoordinator(): jest.Mocked<BackgroundConversationAttentionPort> {
  return {
    commitSignalSyncAttention: jest.fn(),
    commitBackgroundTabSyncAttention: jest.fn(),
  };
}

function createBackgroundSignalSyncStateCoordinator():
  jest.Mocked<BackgroundConversationSignalSyncStatePort> {
  return {
    commitSignalSyncState: jest.fn(),
  };
}

describe('BackgroundConversationPostSyncHandoffCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orchestrates signal-sync handoff through signal state, refresh, and attention seams', async () => {
    const conversation = createConversation();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const backgroundSignalSyncStateCoordinator = createBackgroundSignalSyncStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      backgroundSignalSyncStateCoordinator,
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

    expect(backgroundSignalSyncStateCoordinator.commitSignalSyncState).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      reason: 'message.updated',
    });
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
    expect(
      backgroundSignalSyncStateCoordinator.commitSignalSyncState.mock.invocationCallOrder[0],
    ).toBeLessThan(
      backgroundRefreshExecutor.refreshSignalSyncedBackgroundConversation.mock.invocationCallOrder[0],
    );
    expect(
      backgroundRefreshExecutor.refreshSignalSyncedBackgroundConversation.mock.invocationCallOrder[0],
    ).toBeLessThan(
      backgroundAttentionCoordinator.commitSignalSyncAttention.mock.invocationCallOrder[0],
    );
  });

  it('routes background-tab sync through background refresh before attention writeback', async () => {
    const conversation = createConversation();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const backgroundSignalSyncStateCoordinator = createBackgroundSignalSyncStateCoordinator();
    const backgroundAttentionCoordinator = createBackgroundAttentionCoordinator();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      backgroundSignalSyncStateCoordinator,
      backgroundAttentionCoordinator,
    );

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(backgroundRefreshExecutor.refreshBackgroundTabConversation).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
    });
    expect(backgroundAttentionCoordinator.commitBackgroundTabSyncAttention).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });
    expect(backgroundSignalSyncStateCoordinator.commitSignalSyncState).not.toHaveBeenCalled();
    expect(
      backgroundRefreshExecutor.refreshBackgroundTabConversation.mock.invocationCallOrder[0],
    ).toBeLessThan(
      backgroundAttentionCoordinator.commitBackgroundTabSyncAttention.mock.invocationCallOrder[0],
    );
  });
});
