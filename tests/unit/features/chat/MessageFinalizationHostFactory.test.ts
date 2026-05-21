import {
  createMessageFinalizationHost,
  type MessageFinalizationHostDependencies,
} from '../../../../src/features/chat/services/MessageFinalizationService';

describe('createMessageFinalizationHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getCurrentConversation to deps', () => {
    const deps = { getCurrentConversation: jest.fn().mockReturnValue('conv') };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    expect(host.getCurrentConversation()).toBe('conv');
    expect(deps.getCurrentConversation).toHaveBeenCalled();
  });

  it('maps setConversationSyncInFlight to conversationTabRuntimeCoordinator.updateConversationSyncRuntime', () => {
    const updateConversationSyncRuntime = jest.fn();
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime,
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.setConversationSyncInFlight('tab-1', true);
    expect(updateConversationSyncRuntime).toHaveBeenCalledWith('tab-1', { inFlight: true });
  });

  it('maps setLastConversationSyncFingerprint to conversationTabRuntimeCoordinator.updateConversationSyncRuntime', () => {
    const updateConversationSyncRuntime = jest.fn();
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime,
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle: jest.fn(),
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.setLastConversationSyncFingerprint('tab-1', 'fp-123');
    expect(updateConversationSyncRuntime).toHaveBeenCalledWith('tab-1', { fingerprint: 'fp-123' });
  });

  it('maps transitionTabSessionLifecycle to conversationTabRuntimeCoordinator', () => {
    const transitionTabSessionLifecycle = jest.fn().mockReturnValue(true);
    const deps = {
      conversationTabRuntimeCoordinator: {
        updateConversationSyncRuntime: jest.fn(),
        clearPendingEditedFiles: jest.fn(),
        transitionTabSessionLifecycle,
      },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    expect(host.transitionTabSessionLifecycle('tab-1', 'idle', 'done')).toBe(true);
    expect(transitionTabSessionLifecycle).toHaveBeenCalledWith('tab-1', 'idle', 'done');
  });

  it('delegates scrollToBottom to deps', () => {
    const scrollToBottom = jest.fn();
    const host = createMessageFinalizationHost({ scrollToBottom } as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.scrollToBottom({ enableAutoScroll: true });
    expect(scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('delegates syncIdentity to activeTabContextUsageCoordinator', () => {
    const syncIdentity = jest.fn();
    const deps = {
      activeTabContextUsageCoordinator: { syncIdentity, refreshFromServer: jest.fn().mockResolvedValue(undefined) },
    };
    const host = createMessageFinalizationHost(deps as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    host.syncActiveTabContextUsageIdentity();
    expect(syncIdentity).toHaveBeenCalled();
  });

  it('wraps summarizeChatMessageForDebug from imported module', () => {
    const host = createMessageFinalizationHost({} as Partial<MessageFinalizationHostDependencies> as MessageFinalizationHostDependencies);
    const result = host.summarizeChatMessageForDebug({ id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 });
    expect(result).toBeTruthy();
  });
});
