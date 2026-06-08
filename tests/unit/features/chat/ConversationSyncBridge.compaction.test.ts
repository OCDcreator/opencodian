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

function createBridgeParts(conversation: Conversation) {
  const host: Mocked<ConversationSyncBridgeHost> = {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    canSyncConversationWithServer: jest.fn().mockResolvedValue(true),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue(
      createSyncResult(conversation, {
        fingerprint: 'server-after-compaction',
      }),
    ),
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(
      createSyncResult(conversation, {
        fingerprint: 'canonical-stale',
      }),
    ),
  };
  const runtimeCoordinator: Mocked<ConversationSyncBridgeRuntimeCoordinator> = {
    runVisibleConversationSync: jest.fn(async (currentConversation, callback) => {
      if (!currentConversation) {
        return false;
      }
      await callback({ tabId: 'tab-active', conversation: currentConversation });
      return true;
    }),
  };
  const orchestration: Mocked<ConversationSyncBridgeOrchestration> = {
    startConversationSyncLoop: jest.fn(),
    stopConversationSyncLoop: jest.fn(),
    clearScheduledSignalConversationSync: jest.fn(),
    scheduleConversationSyncFromSignal: jest.fn(),
    syncConversationFromSignal: jest.fn(async (_tabId, _reason, callbacks) => {
      await callbacks.syncVisibleConversation();
    }),
    syncBackgroundTaskTabs: jest.fn().mockResolvedValue(undefined),
  };
  const visiblePostSyncRouter: Mocked<
    Pick<ConversationSyncVisiblePostSyncRouter, 'routeVisibleSyncComplete'>
  > = {
    routeVisibleSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
  const backgroundPostSyncRouter: Mocked<
    Pick<
      ConversationSyncBackgroundPostSyncRouter,
      'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
    >
  > = {
    routeBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
    routeSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
  const bridge = new ConversationSyncBridge({
    host,
    runtimeCoordinator,
    orchestrationService: orchestration,
    visiblePostSyncRouter,
    backgroundPostSyncRouter,
  });

  return {
    bridge,
    host,
    orchestration,
    visiblePostSyncRouter,
  };
}

async function flushAsyncSignalSync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ConversationSyncBridge compaction signals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forces a visible server reload for session.compacted events even when canonical state exists', async () => {
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
    const {
      bridge,
      host,
      orchestration,
      visiblePostSyncRouter,
    } = createBridgeParts(conversation);

    bridge.applySessionSyncEvent('tab-active', {
      sessionId: conversation.openCodeSessionId,
      type: 'session.compacted',
    });

    await flushAsyncSignalSync();

    expect(orchestration.syncConversationFromSignal).toHaveBeenCalledWith(
      'tab-active',
      'session.compacted',
      expect.any(Object),
    );
    expect(host.syncConversationMessagesFromCanonicalState).not.toHaveBeenCalled();
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-active',
      'sync-event:session.compacted',
      { suppressVerboseLogs: true },
    );
    expect(visiblePostSyncRouter.routeVisibleSyncComplete).toHaveBeenCalledWith({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: conversation.messages,
      syncResult: expect.objectContaining({
        fingerprint: 'server-after-compaction',
      }),
    });
  });

  it('includes previous-messages snapshot with live compaction divider for diff-aware rendering on session.compacted', async () => {
    const liveMessages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Question',
        timestamp: 1,
      },
      {
        id: 'compaction-divider-live',
        role: 'user',
        content: '',
        timestamp: 2,
        compactionDivider: { auto: true, overflow: true, tailStartId: 'user-1' },
      } as ChatMessage & { compactionDivider: unknown },
    ];
    const serverMessages: ChatMessage[] = [
      {
        id: 'user-compaction-persisted',
        role: 'user',
        content: '',
        timestamp: 2,
        compactionDivider: { auto: true, overflow: true, tailStartId: 'user-1' },
      } as ChatMessage & { compactionDivider: unknown },
      {
        id: 'summary-persisted',
        role: 'assistant',
        content: 'Compressed 2 earlier turns.',
        timestamp: 3,
        summary: true,
      },
    ];
    const conversation = createConversation('active', { messages: liveMessages });

    const host: Mocked<ConversationSyncBridgeHost> = {
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      canSyncConversationWithServer: jest.fn().mockResolvedValue(true),
      syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
        messages: serverMessages,
        changed: true,
        fingerprint: 'server-compacted',
        revertState: null,
      }),
      syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(null),
    };
    const runtimeCoordinator: Mocked<ConversationSyncBridgeRuntimeCoordinator> = {
      runVisibleConversationSync: jest.fn(async (currentConversation, callback) => {
        if (!currentConversation) return false;
        await callback({ tabId: 'tab-active', conversation: currentConversation });
        return true;
      }),
    };
    const orchestration: Mocked<ConversationSyncBridgeOrchestration> = {
      startConversationSyncLoop: jest.fn(),
      stopConversationSyncLoop: jest.fn(),
      clearScheduledSignalConversationSync: jest.fn(),
      scheduleConversationSyncFromSignal: jest.fn(),
      syncConversationFromSignal: jest.fn(async (_tabId, _reason, callbacks) => {
        await callbacks.syncVisibleConversation();
      }),
      syncBackgroundTaskTabs: jest.fn().mockResolvedValue(undefined),
    };
    const visiblePostSyncRouter: Mocked<
      Pick<ConversationSyncVisiblePostSyncRouter, 'routeVisibleSyncComplete'>
    > = {
      routeVisibleSyncComplete: jest.fn().mockResolvedValue(undefined),
    };
    const backgroundPostSyncRouter: Mocked<
      Pick<
        ConversationSyncBackgroundPostSyncRouter,
        'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
      >
    > = {
      routeBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
      routeSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
    };
    const bridge = new ConversationSyncBridge({
      host,
      runtimeCoordinator,
      orchestrationService: orchestration,
      visiblePostSyncRouter,
      backgroundPostSyncRouter,
    });

    bridge.applySessionSyncEvent('tab-active', {
      sessionId: conversation.openCodeSessionId,
      type: 'session.compacted',
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const routedContext = visiblePostSyncRouter.routeVisibleSyncComplete.mock.calls[0]?.[0];
    expect(routedContext).toBeDefined();

    const previousCompactionMsg = routedContext.previousMessages.find(
      (m: ChatMessage) => 'compactionDivider' in m,
    );
    expect(previousCompactionMsg).toBeDefined();

    const reloadedCompactionMsg = routedContext.syncResult.messages.find(
      (m: ChatMessage) => 'compactionDivider' in m,
    );
    expect(reloadedCompactionMsg).toBeDefined();
    expect(reloadedCompactionMsg.compactionDivider).toMatchObject({
      auto: true,
      overflow: true,
      tailStartId: 'user-1',
    });
    expect(reloadedCompactionMsg.displayStyle).not.toBe('notice');

    const summaryMsg = routedContext.syncResult.messages.find(
      (m: ChatMessage) => m.summary === true,
    );
    expect(summaryMsg).toBeDefined();
  });
});
