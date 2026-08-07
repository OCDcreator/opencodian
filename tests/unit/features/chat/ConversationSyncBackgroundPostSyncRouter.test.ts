import type { Conversation } from '../../../../src/core/types';
import type { BackgroundTaskPostSyncResult } from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffCoordinator';
import {
  type ConversationSyncBackgroundPostSyncHandoffPort,
  ConversationSyncBackgroundPostSyncRouter,
  type ConversationSyncBackgroundPostSyncRouterHost,
  type ConversationSyncBackgroundPostSyncRouterRuntime,
} from '../../../../src/features/chat/services/ConversationSyncBackgroundPostSyncRouter';

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
  overrides?: Partial<BackgroundTaskPostSyncResult>,
): BackgroundTaskPostSyncResult {
  return {
    changed: true,
    fingerprint: 'next-fingerprint',
    ...overrides,
  };
}

function createHost(options?: {
  runtimes?: Record<string, ConversationSyncBackgroundPostSyncRouterRuntime | null>;
}): Mocked<ConversationSyncBackgroundPostSyncRouterHost> {
  const runtimes = new Map<string, ConversationSyncBackgroundPostSyncRouterRuntime | null>(
    Object.entries(options?.runtimes ?? {
      'tab-bg': { lastConversationSyncFingerprint: 'previous-fingerprint' },
    }),
  );

  return {
    getTabRuntimeState: jest.fn().mockImplementation((tabId: string | null) =>
      tabId ? (runtimes.get(tabId) ?? null) : null,
    ),
  };
}

function createCoordinator(): Mocked<ConversationSyncBackgroundPostSyncHandoffPort> {
  return {
    handleSignalSyncComplete: jest.fn().mockResolvedValue(undefined),
    handleBackgroundTabSyncComplete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('ConversationSyncBackgroundPostSyncRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('commits signal fingerprints after a current signal handoff', async () => {
    const conversation = createConversation('signal');
    const host = createHost();
    const coordinator = createCoordinator();
    const router = new ConversationSyncBackgroundPostSyncRouter(host, coordinator);

    await router.routeSignalSyncComplete({
      syncContext: {
        tabId: 'tab-bg',
        conversation,
        reason: 'message.updated',
        activeTabId: 'tab-active',
        tabHasBackgroundTask: true,
        previousFingerprint: 'previous-fingerprint',
      },
      syncResult: createSyncResult({ fingerprint: 'signal-fingerprint' }),
    });

    expect(host.getTabRuntimeState('tab-bg')?.lastConversationSyncFingerprint).toBe(
      'signal-fingerprint',
    );
    expect(coordinator.handleSignalSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      reason: 'message.updated',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
      previousFingerprint: 'previous-fingerprint',
      isCurrent: expect.any(Function),
      syncResult: {
        changed: true,
        fingerprint: 'signal-fingerprint',
      },
    });
  });

  it('does not commit a stale signal fingerprint after the target tab switches during await', async () => {
    const runtime = { lastConversationSyncFingerprint: 'previous-fingerprint' };
    const state = { tabId: 'tab-bg', conversationId: 'signal' };
    const conversation = createConversation('signal');
    const host = createHost({ runtimes: { 'tab-bg': runtime } });
    host.captureBackgroundPostSyncIdentity = jest.fn(() => ({
      isCurrent: () => state.tabId === 'tab-bg' && state.conversationId === conversation.id,
    }));
    let resolveHandoff: (() => void) | undefined;
    const deferred = new Promise<void>((resolve) => {
      resolveHandoff = resolve;
    });
    const coordinator = createCoordinator();
    coordinator.handleSignalSyncComplete.mockReturnValue(deferred);
    const router = new ConversationSyncBackgroundPostSyncRouter(host, coordinator);
    const routePromise = router.routeSignalSyncComplete({
      syncContext: {
        tabId: 'tab-bg',
        conversation,
        reason: 'message.updated',
        activeTabId: 'tab-active',
        tabHasBackgroundTask: true,
        previousFingerprint: 'previous-fingerprint',
      },
      syncResult: createSyncResult({ fingerprint: 'signal-fingerprint' }),
    });

    state.tabId = 'tab-other';
    state.conversationId = 'conversation-b';
    resolveHandoff?.();
    await routePromise;

    expect(runtime.lastConversationSyncFingerprint).toBe('previous-fingerprint');
  });

  it('routes background-tab polling results without touching runtime fingerprints', async () => {
    const conversation = createConversation('background');
    const host = createHost();
    const coordinator = createCoordinator();
    const router = new ConversationSyncBackgroundPostSyncRouter(host, coordinator);

    await router.routeBackgroundTabSyncComplete({
      syncContext: {
        tabId: 'tab-bg',
        conversation,
        previousFingerprint: 'previous-fingerprint',
      },
      syncResult: createSyncResult({ changed: false, fingerprint: 'background-fingerprint' }),
    });

    expect(host.getTabRuntimeState('tab-bg')?.lastConversationSyncFingerprint).toBe(
      'previous-fingerprint',
    );
    expect(coordinator.handleBackgroundTabSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      previousFingerprint: 'previous-fingerprint',
      isCurrent: expect.any(Function),
      syncResult: {
        changed: false,
        fingerprint: 'background-fingerprint',
      },
    });
  });

  it('does not hand off a stale background result after the target tab switches conversations during await', async () => {
    const state = { tabId: 'tab-bg', conversationId: 'conversation-a' };
    const conversation = createConversation('conversation-a');
    const host = createHost();
    host.captureBackgroundPostSyncIdentity = jest.fn(() => ({
      isCurrent: () => state.tabId === 'tab-bg' && state.conversationId === conversation.id,
    }));
    let resolveHandoff: (() => void) | undefined;
    const deferred = new Promise<void>((resolve) => {
      resolveHandoff = resolve;
    });
    const coordinator = createCoordinator();
    coordinator.handleBackgroundTabSyncComplete.mockReturnValue(deferred);
    const router = new ConversationSyncBackgroundPostSyncRouter(host, coordinator);
    const routePromise = router.routeBackgroundTabSyncComplete({
      syncContext: {
        tabId: 'tab-bg',
        conversation,
        previousFingerprint: 'previous-fingerprint',
      },
      syncResult: createSyncResult(),
    });

    state.tabId = 'tab-other';
    state.conversationId = 'conversation-b';
    resolveHandoff?.();
    await routePromise;

    expect(coordinator.handleBackgroundTabSyncComplete).toHaveBeenCalledTimes(1);
    expect(coordinator.handleBackgroundTabSyncComplete.mock.calls[0]?.[0].isCurrent?.()).toBe(false);
  });
});
