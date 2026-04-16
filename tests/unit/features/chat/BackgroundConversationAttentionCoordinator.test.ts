import {
  BackgroundConversationAttentionCoordinator,
  type BackgroundConversationAttentionCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundConversationAttentionCoordinator';

type MockedBackgroundConversationAttentionHost = {
  [Key in keyof BackgroundConversationAttentionCoordinatorHost]:
    BackgroundConversationAttentionCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundConversationAttentionCoordinatorHost[Key];
};

function createHost(): MockedBackgroundConversationAttentionHost {
  return {
    setTabNeedsAttention: jest.fn(),
  };
}

describe('BackgroundConversationAttentionCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks hidden signal-synced tabs for attention when the sync changed', () => {
    const host = createHost();
    const coordinator = new BackgroundConversationAttentionCoordinator(host);

    coordinator.commitSignalSyncAttention({
      tabId: 'tab-bg',
      activeTabId: 'tab-active',
      previousFingerprint: 'old',
      syncResult: { changed: true, fingerprint: 'new' },
    });

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });

  it('clears attention for active tabs when only the fingerprint changed', () => {
    const host = createHost();
    const coordinator = new BackgroundConversationAttentionCoordinator(host);

    coordinator.commitSignalSyncAttention({
      tabId: 'tab-active',
      activeTabId: 'tab-active',
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-active', false);
  });

  it('skips signal attention writes when nothing changed', () => {
    const host = createHost();
    const coordinator = new BackgroundConversationAttentionCoordinator(host);

    coordinator.commitSignalSyncAttention({
      tabId: 'tab-bg',
      activeTabId: 'tab-active',
      previousFingerprint: 'same',
      syncResult: { changed: false, fingerprint: 'same' },
    });

    expect(host.setTabNeedsAttention).not.toHaveBeenCalled();
  });

  it('marks changed background-tab syncs for attention', () => {
    const host = createHost();
    const coordinator = new BackgroundConversationAttentionCoordinator(host);

    coordinator.commitBackgroundTabSyncAttention({
      tabId: 'tab-bg',
      previousFingerprint: 'old',
      syncResult: { changed: false, fingerprint: 'new' },
    });

    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });
});
