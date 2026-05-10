import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  type ConversationSyncRuntime,
  ConversationSyncRuntimeCoordinator,
  type ConversationSyncRuntimeCoordinatorOptions,
} from '../../../../src/features/chat/services/ConversationSyncRuntimeCoordinator';
import {
  createInitialTabSessionLifecycleState,
  transitionTabSessionLifecycle,
} from '../../../../src/features/chat/services/TabSessionPhase';

describe('ConversationSyncRuntimeCoordinator', () => {
  function createConversation(overrides?: Partial<Conversation>): Conversation {
    return {
      id: 'conversation-1',
      title: 'Test conversation',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Hello',
          timestamp: 1,
        },
      ] as ChatMessage[],
      openCodeSessionId: 'session-1',
      ...overrides,
    };
  }

  function createService(options?: {
    activeTabId?: string | null;
    runtime?: Partial<ConversationSyncRuntime> | null;
    fingerprint?: string;
    coordinatorOptions?: ConversationSyncRuntimeCoordinatorOptions;
  }) {
    const runtime: ConversationSyncRuntime | null = options?.runtime === null
      ? null
      : {
        isStreaming: false,
        isConversationSyncInFlight: false,
        lastConversationSyncFingerprint: null,
        tabSessionLifecycle: createInitialTabSessionLifecycleState(),
        ...options?.runtime,
      };
    const getConversationSyncFingerprint = jest.fn().mockReturnValue(
      options?.fingerprint ?? 'derived-fingerprint',
    );
    const transitionLifecycle = jest.fn().mockImplementation((_tabId, phase, reason) => {
      if (runtime) {
        runtime.tabSessionLifecycle = transitionTabSessionLifecycle(
          runtime.tabSessionLifecycle,
          phase,
          reason,
        );
      }
      return true;
    });

    const service = new ConversationSyncRuntimeCoordinator(
      {
        getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-1'),
        getTabRuntimeState: jest.fn().mockImplementation(() => runtime),
        getConversationSyncFingerprint,
        transitionTabSessionLifecycle: transitionLifecycle,
      },
      options?.coordinatorOptions,
    );

    return {
      service,
      runtime,
      getConversationSyncFingerprint,
      transitionTabSessionLifecycle: transitionLifecycle,
    };
  }

  it('skips visible sync when the active runtime is unavailable', async () => {
    const { service } = createService({ runtime: null });
    const callback = jest.fn();

    const ran = await service.runVisibleConversationSync(createConversation(), callback);

    expect(ran).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });

  it('sets and clears the in-flight flag around visible sync work', async () => {
    const { service, runtime, transitionTabSessionLifecycle } = createService();
    const seenStates: boolean[] = [];

    const ran = await service.runVisibleConversationSync(
      createConversation(),
      async () => {
        seenStates.push(runtime?.isConversationSyncInFlight ?? false);
      },
    );

    expect(ran).toBe(true);
    expect(seenStates).toEqual([true]);
    expect(runtime?.isConversationSyncInFlight).toBe(false);
    expect(transitionTabSessionLifecycle).toHaveBeenNthCalledWith(1, 'tab-1', 'syncing', 'conversation-sync-lock');
    expect(transitionTabSessionLifecycle).toHaveBeenNthCalledWith(2, 'tab-1', 'idle', 'conversation-sync-lock-release');
  });

  it('derives the previous fingerprint from runtime state before tab sync', async () => {
    const { service, getConversationSyncFingerprint } = createService({
      runtime: {
        lastConversationSyncFingerprint: 'existing-fingerprint',
      },
    });
    const callback = jest.fn().mockResolvedValue(undefined);

    await service.runTabConversationSync(
      {
        tabId: 'tab-1',
        conversation: createConversation(),
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      tabId: 'tab-1',
      conversation: expect.objectContaining({ id: 'conversation-1' }),
      previousFingerprint: 'existing-fingerprint',
    });
    expect(getConversationSyncFingerprint).not.toHaveBeenCalled();
  });

  it('falls back to message-derived fingerprint for tab sync baselines', async () => {
    const { service, getConversationSyncFingerprint } = createService();
    const callback = jest.fn().mockResolvedValue(undefined);

    await service.runTabConversationSync(
      {
        tabId: 'tab-1',
        conversation: createConversation(),
      },
      callback,
    );

    expect(getConversationSyncFingerprint).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'message-1' }),
    ]);
    expect(callback).toHaveBeenCalledWith({
      tabId: 'tab-1',
      conversation: expect.objectContaining({ id: 'conversation-1' }),
      previousFingerprint: 'derived-fingerprint',
    });
  });

  it('clears the in-flight flag after tab sync failures', async () => {
    const { service, runtime } = createService();

    await expect(service.runTabConversationSync(
      {
        tabId: 'tab-1',
        conversation: createConversation(),
      },
      async () => {
        expect(runtime?.isConversationSyncInFlight).toBe(true);
        throw new Error('sync failed');
      },
    )).rejects.toThrow('sync failed');

    expect(runtime?.isConversationSyncInFlight).toBe(false);
  });

  it('reports a stuck syncing lock without clearing it automatically', async () => {
    jest.useFakeTimers();
    try {
      const onSyncTimeout = jest.fn();
      const { service, runtime } = createService({
        coordinatorOptions: {
          syncTimeoutMs: 25,
          onSyncTimeout,
          now: () => Date.now(),
          setTimeout: (callback, delay) => setTimeout(callback, delay),
          clearTimeout: (handle) => clearTimeout(handle),
        },
      });
      const conversation = createConversation();
      let releaseSync: (() => void) | null = null;

      const sync = service.runVisibleConversationSync(
        conversation,
        () => new Promise<void>((resolve) => {
          releaseSync = resolve;
        }),
      );
      await Promise.resolve();

      expect(runtime?.isConversationSyncInFlight).toBe(true);
      await jest.advanceTimersByTimeAsync(25);

      expect(onSyncTimeout).toHaveBeenCalledWith(expect.objectContaining({
        tabId: 'tab-1',
        conversationId: conversation.id,
        openCodeSessionId: conversation.openCodeSessionId,
        phase: 'syncing',
        reason: 'conversation-sync-lock',
        isStreaming: false,
      }));
      expect(runtime?.isConversationSyncInFlight).toBe(true);

      releaseSync?.();
      await sync;
      expect(runtime?.isConversationSyncInFlight).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the syncing timeout timer after a fast sync completes', async () => {
    jest.useFakeTimers();
    try {
      const onSyncTimeout = jest.fn();
      const { service } = createService({
        coordinatorOptions: {
          syncTimeoutMs: 25,
          onSyncTimeout,
          now: () => Date.now(),
          setTimeout: (callback, delay) => setTimeout(callback, delay),
          clearTimeout: (handle) => clearTimeout(handle),
        },
      });

      await service.runVisibleConversationSync(createConversation(), async () => undefined);
      await jest.advanceTimersByTimeAsync(25);

      expect(onSyncTimeout).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
