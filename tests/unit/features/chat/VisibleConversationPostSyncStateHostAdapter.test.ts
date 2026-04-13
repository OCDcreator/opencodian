import type { Conversation } from '../../../../src/core/types';
import {
  createVisibleConversationPostSyncStateHosts,
  createVisibleConversationPostSyncStateServices,
  type VisibleConversationPostSyncStateViewHost,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateHostAdapter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id = 'conversation-active',
  overrides?: Partial<Conversation>,
): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `session-${id}`,
    messages: [],
    ...overrides,
  };
}

function createViewHost(
  currentConversation: Conversation | null = createConversation('conversation-active'),
): Mocked<VisibleConversationPostSyncStateViewHost> {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    setCurrentConversationRevertState: jest.fn(),
    setTabConversationSyncFingerprint: jest.fn(),
  };
}

describe('VisibleConversationPostSyncStateHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives visible post-sync state host callbacks from one shared view host', () => {
    const viewHost = createViewHost();

    const hosts = createVisibleConversationPostSyncStateHosts(viewHost);

    expect(hosts.visibleConversationPostSyncStateCoordinatorHost.getCurrentConversationId()).toBe(
      'conversation-active',
    );

    hosts.visibleConversationPostSyncStateCoordinatorHost.setCurrentConversationRevertState({
      messageID: 'assistant-1',
    });
    hosts.visibleConversationPostSyncStateCoordinatorHost.setTabConversationSyncFingerprint(
      'tab-active',
      'next-fingerprint',
    );

    expect(viewHost.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
    });
    expect(viewHost.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-active',
      'next-fingerprint',
    );
  });

  it('wires visible post-sync state coordinator through the shared current conversation bridge', () => {
    const viewHost = createViewHost();

    const { visibleConversationPostSyncStateCoordinator } =
      createVisibleConversationPostSyncStateServices(viewHost);

    const outcome = visibleConversationPostSyncStateCoordinator.commitPostSyncState({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-active',
      syncResult: {
        changed: true,
        fingerprint: 'next-fingerprint',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });

    expect(viewHost.getCurrentConversation).toHaveBeenCalled();
    expect(viewHost.setCurrentConversationRevertState).toHaveBeenCalledWith({
      messageID: 'assistant-1',
      partID: 'part-1',
    });
    expect(viewHost.setTabConversationSyncFingerprint).toHaveBeenCalledWith(
      'tab-active',
      'next-fingerprint',
    );
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });
});
