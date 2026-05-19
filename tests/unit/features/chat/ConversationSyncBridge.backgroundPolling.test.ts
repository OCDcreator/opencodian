import type { Conversation } from '../../../../src/core/types';
import type { ConversationSyncBackgroundPostSyncRouter } from '../../../../src/features/chat/services/ConversationSyncBackgroundPostSyncRouter';
import {
  ConversationSyncBridge,
  type ConversationSyncBridgeHost,
  type ConversationSyncBridgeOrchestration,
  type ConversationSyncBridgeRuntimeCoordinator,
  type ConversationSyncBridgeSyncResult,
} from '../../../../src/features/chat/services/ConversationSyncBridge';
import type { TabConversationSyncContext } from '../../../../src/features/chat/services/ConversationSyncRuntimeCoordinator';
import type { ConversationSyncVisiblePostSyncRouter } from '../../../../src/features/chat/services/ConversationSyncVisiblePostSyncRouter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(id: string, overrides?: Partial<Conversation>): Conversation {
  return {
    id,
    title: `Conversation ${id}`,
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    openCodeSessionId: `session-${id}`,
    ...overrides,
  };
}

function createSyncResult(
  conversation: Conversation,
  overrides?: Partial<ConversationSyncBridgeSyncResult>,
): ConversationSyncBridgeSyncResult {
  return {
    messages: conversation.messages,
    changed: true,
    fingerprint: `fingerprint-${conversation.id}`,
    revertState: null,
    ...overrides,
  };
}

function createHost(options?: {
  currentConversation?: Conversation | null;
  syncResult?: ConversationSyncBridgeSyncResult;
  canSyncConversationWithServer?: boolean;
}): Mocked<ConversationSyncBridgeHost> {
  const conversation = options?.currentConversation ?? createConversation('active');

  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    canSyncConversationWithServer: jest.fn().mockResolvedValue(
      options?.canSyncConversationWithServer ?? true,
    ),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue(
      options?.syncResult ?? createSyncResult(conversation),
    ),
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(
      options?.syncResult ?? createSyncResult(conversation),
    ),
  };
}

function createRuntimeCoordinator(): Mocked<ConversationSyncBridgeRuntimeCoordinator> {
  return {
    runVisibleConversationSync: jest.fn(),
  };
}

function createOrchestration(): Mocked<ConversationSyncBridgeOrchestration> {
  return {
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
    clearScheduledSignalConversationSync: jest.fn(),
    scheduleConversationSyncFromSignal: jest.fn(),
    syncConversationFromSignal: jest.fn(),
    syncBackgroundTaskTabs: jest.fn().mockResolvedValue(undefined),
  };
}

function createVisiblePostSyncRouter(): Mocked<
  Pick<ConversationSyncVisiblePostSyncRouter, 'routeVisibleSyncComplete'>
> {
  return {
    routeVisibleSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

function createBackgroundPostSyncRouter(): Mocked<
  Pick<
    ConversationSyncBackgroundPostSyncRouter,
    'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
  >
> {
  return {
    routeBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
    routeSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationSyncBridge background polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses canonical state before server sync for background-tab polling callbacks', async () => {
    const backgroundConversation = createConversation('background');
    const host = createHost({
      currentConversation: createConversation('active'),
      syncResult: createSyncResult(backgroundConversation, {
        changed: false,
        fingerprint: 'background-new',
      }),
    });
    const runtimeCoordinator = createRuntimeCoordinator();
    const orchestration = createOrchestration();
    const visiblePostSyncRouter = createVisiblePostSyncRouter();
    const backgroundPostSyncRouter = createBackgroundPostSyncRouter();
    const bridge = new ConversationSyncBridge({
      host,
      runtimeCoordinator,
      orchestrationService: orchestration,
      visiblePostSyncRouter,
      backgroundPostSyncRouter,
    });
    let backgroundCallback: ((context: TabConversationSyncContext) => Promise<void>) | null = null;

    orchestration.syncBackgroundTaskTabs.mockImplementation(async (callback) => {
      backgroundCallback = callback;
    });

    await bridge.syncBackgroundTaskTabsInBackground();
    expect(backgroundCallback).not.toBeNull();

    await backgroundCallback?.({
      tabId: 'tab-bg',
      conversation: backgroundConversation,
      previousFingerprint: 'background-old',
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      backgroundConversation,
      'tab-bg',
      'background-tab-sync',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(backgroundPostSyncRouter.routeBackgroundTabSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-bg',
        conversation: backgroundConversation,
        previousFingerprint: 'background-old',
      },
      syncResult: expect.objectContaining({
        fingerprint: 'background-new',
      }),
    });
  });

  it('falls back to server sync for background-tab polling when canonical state is missing', async () => {
    const backgroundConversation = createConversation('background-fallback');
    const host = createHost({
      currentConversation: createConversation('active'),
      syncResult: createSyncResult(backgroundConversation, {
        changed: false,
        fingerprint: 'background-fallback-new',
      }),
    });
    host.syncConversationMessagesFromCanonicalState.mockResolvedValue(null);
    const runtimeCoordinator = createRuntimeCoordinator();
    const orchestration = createOrchestration();
    const visiblePostSyncRouter = createVisiblePostSyncRouter();
    const backgroundPostSyncRouter = createBackgroundPostSyncRouter();
    const bridge = new ConversationSyncBridge({
      host,
      runtimeCoordinator,
      orchestrationService: orchestration,
      visiblePostSyncRouter,
      backgroundPostSyncRouter,
    });
    let backgroundCallback: ((context: TabConversationSyncContext) => Promise<void>) | null = null;

    orchestration.syncBackgroundTaskTabs.mockImplementation(async (callback) => {
      backgroundCallback = callback;
    });

    await bridge.syncBackgroundTaskTabsInBackground();
    expect(backgroundCallback).not.toBeNull();

    await backgroundCallback?.({
      tabId: 'tab-bg',
      conversation: backgroundConversation,
      previousFingerprint: 'background-fallback-old',
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      backgroundConversation,
      'tab-bg',
      'background-tab-sync',
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      backgroundConversation,
      'tab-bg',
      'background-tab-sync',
      { suppressVerboseLogs: true },
    );
    expect(backgroundPostSyncRouter.routeBackgroundTabSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-bg',
        conversation: backgroundConversation,
        previousFingerprint: 'background-fallback-old',
      },
      syncResult: expect.objectContaining({
        fingerprint: 'background-fallback-new',
      }),
    });
  });

  it('skips background-tab server fallback when the backend is unavailable', async () => {
    const backgroundConversation = createConversation('background-disabled');
    const host = createHost({
      currentConversation: createConversation('active'),
      canSyncConversationWithServer: false,
    });
    host.syncConversationMessagesFromCanonicalState.mockResolvedValue(null);
    const runtimeCoordinator = createRuntimeCoordinator();
    const orchestration = createOrchestration();
    const visiblePostSyncRouter = createVisiblePostSyncRouter();
    const backgroundPostSyncRouter = createBackgroundPostSyncRouter();
    const bridge = new ConversationSyncBridge({
      host,
      runtimeCoordinator,
      orchestrationService: orchestration,
      visiblePostSyncRouter,
      backgroundPostSyncRouter,
    });
    let backgroundCallback: ((context: TabConversationSyncContext) => Promise<void>) | null = null;

    orchestration.syncBackgroundTaskTabs.mockImplementation(async (callback) => {
      backgroundCallback = callback;
    });

    await bridge.syncBackgroundTaskTabsInBackground();
    expect(backgroundCallback).not.toBeNull();

    await backgroundCallback?.({
      tabId: 'tab-bg',
      conversation: backgroundConversation,
      previousFingerprint: 'background-disabled-old',
    });

    expect(host.canSyncConversationWithServer).toHaveBeenCalledTimes(1);
    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      backgroundConversation,
      'tab-bg',
      'background-tab-sync',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(backgroundPostSyncRouter.routeBackgroundTabSyncComplete).not.toHaveBeenCalled();
  });
});
