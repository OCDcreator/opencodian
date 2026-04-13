import {
  BackgroundConversationSignalSyncStateCoordinator,
  type BackgroundConversationSignalSyncStateCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundConversationSignalSyncStateCoordinator';

type MockedBackgroundConversationSignalSyncStateHost = {
  [Key in keyof BackgroundConversationSignalSyncStateCoordinatorHost]:
    BackgroundConversationSignalSyncStateCoordinatorHost[Key] extends (
      ...args: infer Args
    ) => infer Result
      ? jest.Mock<Result, Args>
      : BackgroundConversationSignalSyncStateCoordinatorHost[Key];
};

function createHost(): MockedBackgroundConversationSignalSyncStateHost {
  return {
    markBackgroundTaskAuthoritativeSync: jest.fn(),
  };
}

describe('BackgroundConversationSignalSyncStateCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks signal-synced conversations as authoritative with the sync-event reason', () => {
    const host = createHost();
    const coordinator = new BackgroundConversationSignalSyncStateCoordinator(host);

    coordinator.commitSignalSyncState({
      tabId: 'tab-bg',
      reason: 'message.updated',
    });

    expect(host.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:message.updated',
    );
  });
});
