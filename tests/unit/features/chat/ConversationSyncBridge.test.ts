import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationSyncBridge,
  type ConversationSyncBridgeHost,
  type ConversationSyncBridgeOrchestration,
  type ConversationSyncBridgePostSyncCoordinator,
  type ConversationSyncBridgeRuntime,
  type ConversationSyncBridgeRuntimeCoordinator,
  type ConversationSyncBridgeSyncResult,
} from '../../../../src/features/chat/services/ConversationSyncBridge';
import type { SignalConversationSyncContext } from '../../../../src/features/chat/services/ConversationSyncOrchestrationService';
import type { TabConversationSyncContext } from '../../../../src/features/chat/services/ConversationSyncRuntimeCoordinator';

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
  runtimes?: Record<string, ConversationSyncBridgeRuntime | null>;
  syncResult?: ConversationSyncBridgeSyncResult;
}): Mocked<ConversationSyncBridgeHost> {
  const runtimes = new Map<string, ConversationSyncBridgeRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-active': { lastConversationSyncFingerprint: 'initial-active' },
      'tab-bg': { lastConversationSyncFingerprint: 'initial-bg' },
    }),
  );
  const conversation = options?.currentConversation ?? createConversation('active');

  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue(
      options?.syncResult ?? createSyncResult(conversation),
    ),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
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
    syncBackgroundTaskTabs: jest.fn().mockResolvedValue(undefined),
  };
}

function createPostSyncCoordinator(): Mocked<ConversationSyncBridgePostSyncCoordinator> {
  return {
    handleVisibleConversationSyncComplete: jest.fn().mockResolvedValue({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    }),
    handleSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
    handleBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationSyncBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies visible synced updates through the view host only when post-sync requests it', async () => {
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
    const postSyncCoordinator = createPostSyncCoordinator();
    const bridge = new ConversationSyncBridge(
      host,
      runtimeCoordinator,
      orchestration,
      postSyncCoordinator,
    );

    await bridge.syncVisibleConversationInBackground();

    expect(runtimeCoordinator.runVisibleConversationSync).toHaveBeenCalledWith(
      conversation,
      expect.any(Function),
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'visible-background-sync',
      { suppressVerboseLogs: true },
    );
    expect(postSyncCoordinator.handleVisibleConversationSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'visible',
      questionSessionId: 'session-visible',
      syncResult: expect.objectContaining({
        changed: true,
        fingerprint: 'visible-new',
        revertState: { messageID: 'assistant-next' },
      }),
    });
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      conversation.messages,
      conversation.messages,
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
  });

  it('falls back to indicator rendering when visible post-sync skips DOM patching', async () => {
    const conversation = createConversation('visible');
    const host = createHost({
      currentConversation: conversation,
      syncResult: createSyncResult(conversation, {
        changed: false,
        fingerprint: 'visible-same',
      }),
    });
    const runtimeCoordinator = createRuntimeCoordinator();
    const orchestration = createOrchestration();
    const postSyncCoordinator = createPostSyncCoordinator();
    postSyncCoordinator.handleVisibleConversationSyncComplete.mockResolvedValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const bridge = new ConversationSyncBridge(
      host,
      runtimeCoordinator,
      orchestration,
      postSyncCoordinator,
    );

    await bridge.syncVisibleConversationInBackground();

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-active');
  });

  it('assembles signal sync callbacks with sync-result fingerprint commits and post-sync routing', async () => {
    const hiddenConversation = createConversation('hidden');
    const host = createHost({
      currentConversation: createConversation('active'),
      syncResult: createSyncResult(hiddenConversation, {
        changed: true,
        fingerprint: 'hidden-new',
      }),
    });
    const runtimeCoordinator = createRuntimeCoordinator();
    const orchestration = createOrchestration();
    const postSyncCoordinator = createPostSyncCoordinator();
    const bridge = new ConversationSyncBridge(
      host,
      runtimeCoordinator,
      orchestration,
      postSyncCoordinator,
    );
    let capturedCallbacks:
      | {
        syncVisibleConversation: () => Promise<void>;
        syncTabConversation: (context: SignalConversationSyncContext) => Promise<void>;
      }
      | null = null;

    orchestration.scheduleConversationSyncFromSignal.mockImplementation((_tabId, _reason, callbacks) => {
      capturedCallbacks = callbacks;
    });

    bridge.scheduleConversationSyncFromSignal('tab-bg', 'message.updated');
    expect(capturedCallbacks).not.toBeNull();

    await capturedCallbacks?.syncTabConversation({
      tabId: 'tab-bg',
      conversation: hiddenConversation,
      previousFingerprint: 'hidden-old',
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
    });

    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      hiddenConversation,
      'tab-bg',
      'sync-event:message.updated',
      { suppressVerboseLogs: true },
    );
    expect(host.getTabRuntimeState('tab-bg')?.lastConversationSyncFingerprint).toBe('hidden-new');
    expect(postSyncCoordinator.handleSignalSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation: hiddenConversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
      previousFingerprint: 'hidden-old',
      syncResult: expect.objectContaining({
        fingerprint: 'hidden-new',
      }),
    });
  });

  it('assembles background-tab polling callbacks through the post-sync coordinator', async () => {
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
    const postSyncCoordinator = createPostSyncCoordinator();
    const bridge = new ConversationSyncBridge(
      host,
      runtimeCoordinator,
      orchestration,
      postSyncCoordinator,
    );
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
    expect(postSyncCoordinator.handleBackgroundTabSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation: backgroundConversation,
      previousFingerprint: 'background-old',
      syncResult: expect.objectContaining({
        fingerprint: 'background-new',
      }),
    });
  });
});
