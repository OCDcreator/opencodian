import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
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

function createConversation(
  id: string,
  overrides?: Partial<Conversation>,
): Conversation {
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
}): Mocked<ConversationSyncBridgeHost> {
  const conversation = options?.currentConversation ?? createConversation('active');

  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
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
    runVisibleConversationSync: jest.fn(async (conversation, callback) => {
      if (!conversation) {
        return false;
      }

      await callback({
        tabId: 'tab-active',
        conversation,
      });
      return true;
    }),
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

describe('ConversationSyncBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes visible sync callbacks through the canonical-first visible post-sync router', async () => {
    const conversation = createConversation('visible', {
      messages: [
        {
          id: 'assistant-next',
          role: 'assistant',
          content: 'updated',
          timestamp: 2,
        } as ChatMessage,
      ],
    });
    const host = createHost({
      currentConversation: conversation,
      syncResult: createSyncResult(conversation, {
        changed: true,
        fingerprint: 'visible-new',
        revertState: { messageID: 'assistant-next' },
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

    await bridge.syncVisibleConversationInBackground();

    expect(runtimeCoordinator.runVisibleConversationSync).toHaveBeenCalledWith(
      conversation,
      expect.any(Function),
    );
    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'visible-background-sync',
      { suppressVerboseLogs: true },
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(visiblePostSyncRouter.routeVisibleSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: conversation.messages,
      syncResult: expect.objectContaining({
        changed: true,
        fingerprint: 'visible-new',
        revertState: { messageID: 'assistant-next' },
      }),
    });
  });

  it('falls back to server sync when visible background sync has no canonical session state yet', async () => {
    const conversation = createConversation('visible-fallback');
    const host = createHost({
      currentConversation: conversation,
      syncResult: createSyncResult(conversation, {
        changed: false,
        fingerprint: 'visible-fallback',
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

    await bridge.syncVisibleConversationInBackground();

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'visible-background-sync',
      { suppressVerboseLogs: true },
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'visible-background-sync',
      { suppressVerboseLogs: true },
    );
    expect(visiblePostSyncRouter.routeVisibleSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: conversation.messages,
      syncResult: expect.objectContaining({
        changed: false,
        fingerprint: 'visible-fallback',
      }),
    });
  });

  it('ignores session.diff as message sync input', async () => {
    const conversation = createConversation('active');
    const host = createHost({
      currentConversation: conversation,
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

    bridge.applySessionSyncEvent('tab-active', {
      sessionId: conversation.openCodeSessionId,
      type: 'session.diff',
      diff: [{ file: 'notes.md', additions: 1, deletions: 0 }],
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(orchestration.scheduleConversationSyncFromSignal).not.toHaveBeenCalled();
    expect(orchestration.syncConversationFromSignal).not.toHaveBeenCalled();
    expect(host.syncConversationMessagesFromCanonicalState).not.toHaveBeenCalled();
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(visiblePostSyncRouter.routeVisibleSyncComplete).not.toHaveBeenCalled();
    expect(backgroundPostSyncRouter.routeSignalSyncComplete).not.toHaveBeenCalled();
  });
});

describe('ConversationSyncBridge canonical sync events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies visible message sync events from canonical state without server reload', async () => {
    const conversation = createConversation('active', {
      messages: [
        {
          id: 'assistant-old',
          role: 'assistant',
          content: 'old',
          timestamp: 1,
        } as ChatMessage,
      ],
    });
    const canonicalResult = createSyncResult(conversation, {
      changed: true,
      fingerprint: 'canonical-new',
    });
    const host = createHost({
      currentConversation: conversation,
      syncResult: canonicalResult,
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

    orchestration.syncConversationFromSignal.mockImplementation(async (_tabId, _reason, callbacks) => {
      await callbacks.syncVisibleConversation();
    });

    bridge.applySessionSyncEvent('tab-active', {
      sessionId: conversation.openCodeSessionId,
      type: 'message.updated',
      info: {
        id: 'assistant-next',
        sessionID: conversation.openCodeSessionId,
        role: 'assistant',
        time: { created: 2 },
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(orchestration.syncConversationFromSignal).toHaveBeenCalledWith(
      'tab-active',
      'message.updated',
      expect.any(Object),
    );
    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'sync-event:message.updated',
      { suppressVerboseLogs: true },
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(visiblePostSyncRouter.routeVisibleSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: conversation.messages,
      syncResult: expect.objectContaining({
        fingerprint: 'canonical-new',
      }),
    });
  });

  it('falls back to server sync when canonical state is missing for signal events', async () => {
    const hiddenConversation = createConversation('hidden');
    const host = createHost({
      currentConversation: createConversation('active'),
      syncResult: createSyncResult(hiddenConversation, {
        changed: true,
        fingerprint: 'hidden-fallback',
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

    orchestration.syncConversationFromSignal.mockImplementation(async (_tabId, reason, callbacks) => {
      await callbacks.syncTabConversation({
        tabId: 'tab-bg',
        conversation: hiddenConversation,
        previousFingerprint: 'hidden-old',
        reason,
        activeTabId: 'tab-active',
        tabHasBackgroundTask: true,
      });
    });

    bridge.applySessionSyncEvent('tab-bg', {
      sessionId: hiddenConversation.openCodeSessionId,
      type: 'message.part.delta',
      messageId: 'assistant-next',
      partId: 'part-text',
      field: 'text',
      delta: 'hi',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      hiddenConversation,
      'tab-bg',
      'sync-event:message.part.delta',
      { suppressVerboseLogs: true },
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      hiddenConversation,
      'tab-bg',
      'sync-event:message.part.delta',
      { suppressVerboseLogs: true },
    );
    expect(backgroundPostSyncRouter.routeSignalSyncComplete).toHaveBeenCalledWith({
      syncContext: expect.objectContaining({
        tabId: 'tab-bg',
        reason: 'message.part.delta',
      }),
      syncResult: expect.objectContaining({
        fingerprint: 'hidden-fallback',
      }),
    });
  });
});

describe('ConversationSyncBridge background polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes background-tab polling callbacks through the background post-sync router', async () => {
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

    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      backgroundConversation,
      'tab-bg',
      'background-tab-sync',
    );
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
});
