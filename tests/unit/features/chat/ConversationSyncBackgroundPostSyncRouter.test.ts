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

  it('commits signal fingerprints before routing the shaped signal post-sync options', async () => {
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
      syncResult: {
        changed: true,
        fingerprint: 'signal-fingerprint',
      },
    });
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
      syncResult: {
        changed: false,
        fingerprint: 'background-fingerprint',
      },
    });
  });
});
