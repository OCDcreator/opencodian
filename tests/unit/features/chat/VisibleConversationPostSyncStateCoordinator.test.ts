import {
  VisibleConversationPostSyncStateCoordinator,
  type VisibleConversationPostSyncStateCoordinatorHost,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateCoordinator';

type MockedVisiblePostSyncStateHost = {
  [Key in keyof VisibleConversationPostSyncStateCoordinatorHost]:
    VisibleConversationPostSyncStateCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : VisibleConversationPostSyncStateCoordinatorHost[Key];
};

function createHost(): MockedVisiblePostSyncStateHost {
  return {
    getCurrentConversationId: jest.fn().mockReturnValue('conversation-1'),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
  };
}

describe('VisibleConversationPostSyncStateCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('commits revert state and fingerprint when visible sync still targets current conversation', () => {
    const host = createHost();
    const coordinator = new VisibleConversationPostSyncStateCoordinator(host);

    const outcome = coordinator.commitPostSyncState({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: true,
        fingerprint: 'next-fingerprint',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });

    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
      partID: 'part-1',
    });
    expect(host.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-active',
      'next-fingerprint',
    );
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });

  it('keeps revert state current but skips fingerprint when visible sync is unchanged', () => {
    const host = createHost();
    const coordinator = new VisibleConversationPostSyncStateCoordinator(host);

    const outcome = coordinator.commitPostSyncState({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: false,
        fingerprint: 'same-fingerprint',
        revertState: { messageID: 'assistant-2' },
      },
    });

    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-2',
    });
    expect(host.setTabConversationSyncFingerprint).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });

  it('skips visible writes when the current conversation no longer matches', () => {
    const host = createHost();
    host.getCurrentConversationId.mockReturnValue('conversation-2');
    const coordinator = new VisibleConversationPostSyncStateCoordinator(host);

    const outcome = coordinator.commitPostSyncState({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: true,
        fingerprint: 'next-fingerprint',
        revertState: { messageID: 'assistant-3' },
      },
    });

    expect(host.setCurrentConversationRevertState).not.toHaveBeenCalled();
    expect(host.setTabConversationSyncFingerprint).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });
});
