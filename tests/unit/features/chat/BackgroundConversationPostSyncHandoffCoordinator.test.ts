import type { Conversation } from '../../../../src/core/types';
import {
  BackgroundConversationPostSyncHandoffCoordinator,
  type BackgroundConversationPostSyncHandoffCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import type { BackgroundConversationPostSyncRefreshExecutor } from '../../../../src/features/chat/services/BackgroundConversationPostSyncRefreshExecutor';

type BackgroundConversationRefreshPort = Pick<
  BackgroundConversationPostSyncRefreshExecutor,
  | 'refreshBackgroundTabConversation'
  | 'refreshSignalSyncedBackgroundConversation'
>;
type MockedHandoffHost = {
  [Key in keyof BackgroundConversationPostSyncHandoffCoordinatorHost]:
    BackgroundConversationPostSyncHandoffCoordinatorHost[Key] extends (
      ...args: infer Args
    ) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundConversationPostSyncHandoffCoordinatorHost[Key];
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

function createBackgroundRefreshExecutor(): jest.Mocked<BackgroundConversationRefreshPort> {
  return {
    refreshSignalSyncedBackgroundConversation: jest.fn().mockResolvedValue(undefined),
    refreshBackgroundTabConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createHandoffHost(): MockedHandoffHost {
  return {
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

describe('BackgroundConversationPostSyncHandoffCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orchestrates signal-sync handoff through signal state, refresh, and attention seams', async () => {
    const conversation = createConversation();
    const callOrder: string[] = [];
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const host = createHandoffHost();
    host.markBackgroundTaskAuthoritativeSync.mockImplementation(() => {
      callOrder.push('markBackgroundTaskAuthoritativeSync');
    });
    backgroundRefreshExecutor.refreshSignalSyncedBackgroundConversation.mockImplementation(
      async () => {
        callOrder.push('refreshSignalSyncedBackgroundConversation');
      },
    );
    host.setTabNeedsAttention.mockImplementation(() => {
      callOrder.push('setTabNeedsAttention');
    });
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
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
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
    expect(callOrder).toEqual([
      'markBackgroundTaskAuthoritativeSync',
      'refreshSignalSyncedBackgroundConversation',
      'setTabNeedsAttention',
    ]);
  });

  it('routes background-tab sync through background refresh before attention writeback', async () => {
    const conversation = createConversation();
    const callOrder: string[] = [];
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const host = createHandoffHost();
    backgroundRefreshExecutor.refreshBackgroundTabConversation.mockImplementation(async () => {
      callOrder.push('refreshBackgroundTabConversation');
    });
    host.setTabNeedsAttention.mockImplementation(() => {
      callOrder.push('setTabNeedsAttention');
    });
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
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
    expect(host.markBackgroundTaskAuthoritativeSync).not.toHaveBeenCalled();
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
    expect(callOrder).toEqual([
      'refreshBackgroundTabConversation',
      'setTabNeedsAttention',
    ]);
  });

  it('clears attention for active signal-synced tabs when only the fingerprint changed', async () => {
    const conversation = createConversation();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const host = createHandoffHost();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
    );

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-active',
      conversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
  });

  it('skips attention writes when a signal sync did not change', async () => {
    const conversation = createConversation();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const host = createHandoffHost();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
    );

    await coordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: false,
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('skips attention writes when a background-tab sync did not change', async () => {
    const conversation = createConversation();
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    const host = createHandoffHost();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
    );

    await coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('does not write attention for a stale background result after the target tab switches during refresh', async () => {
    const conversation = createConversation();
    const state = { tabId: 'tab-bg', conversationId: conversation.id };
    let resolveRefresh: (() => void) | undefined;
    const refreshDeferred = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const backgroundRefreshExecutor = createBackgroundRefreshExecutor();
    backgroundRefreshExecutor.refreshBackgroundTabConversation.mockReturnValue(refreshDeferred);
    const host = createHandoffHost();
    const coordinator = new BackgroundConversationPostSyncHandoffCoordinator(
      backgroundRefreshExecutor,
      host,
    );
    const handoffPromise = coordinator.handleBackgroundTabSyncComplete({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'old',
      syncResult: { changed: true, fingerprint: 'new' },
      isCurrent: () => state.tabId === 'tab-bg' && state.conversationId === conversation.id,
    });

    state.tabId = 'tab-other';
    state.conversationId = 'conversation-b';
    resolveRefresh?.();
    await handoffPromise;

    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });
});
