import type { Conversation } from '../../../../src/core/types';
import {
  type BackgroundConversationPostSyncHandoffViewHost,
  type BackgroundConversationPostSyncHandoffViewHostAdapterHost,
  createBackgroundConversationPostSyncHandoffHosts,
  createBackgroundConversationPostSyncHandoffServices,
  createBackgroundConversationPostSyncHandoffViewHostAdapter,
} from '../../../../src/features/chat/services/BackgroundConversationPostSyncHandoffHostAdapter';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id = 'conversation-bg',
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

function createViewHost(): Mocked<BackgroundConversationPostSyncHandoffViewHost> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(),
    flushBackgroundTaskPostSyncWriteback: jest.fn().mockResolvedValue(undefined),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    setTabNeedsAttention: jest.fn(),
  };
}

function createViewHostAdapterHost():
  Mocked<BackgroundConversationPostSyncHandoffViewHostAdapterHost> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(),
  };
}

describe('BackgroundConversationPostSyncHandoffHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adapts late-bound background handoff ports into one view host', async () => {
    const conversation = createConversation();
    const viewHost = createViewHostAdapterHost();

    const lateBoundPorts: {
      backgroundTaskIndicatorCoordinator?: {
        flushCompletionNoticesAndSyncStreamLikeState: jest.Mock<
          Promise<void>,
          [string | null, Conversation | null]
        >;
      };
      backgroundTaskLiveSignalCoordinator?: {
        markAuthoritativeSync: jest.Mock<void, [string | null, string]>;
      };
      tabRuntimeStateBridge?: {
        setNeedsAttention: jest.Mock<void, [string | null, boolean]>;
      };
    } = {};

    const adaptedViewHost = createBackgroundConversationPostSyncHandoffViewHostAdapter({
      viewHost,
      getBackgroundTaskIndicatorCoordinator: () => lateBoundPorts.backgroundTaskIndicatorCoordinator!,
      getBackgroundTaskLiveSignalCoordinator: () => lateBoundPorts.backgroundTaskLiveSignalCoordinator!,
      getTabRuntimeStateBridge: () => lateBoundPorts.tabRuntimeStateBridge!,
    });

    lateBoundPorts.backgroundTaskIndicatorCoordinator = {
      flushCompletionNoticesAndSyncStreamLikeState: jest.fn().mockResolvedValue(undefined),
    };
    lateBoundPorts.backgroundTaskLiveSignalCoordinator = {
      markAuthoritativeSync: jest.fn(),
    };
    lateBoundPorts.tabRuntimeStateBridge = {
      setNeedsAttention: jest.fn(),
    };

    adaptedViewHost.syncBackgroundTaskStateFromConversation(conversation, 'tab-bg');
    await adaptedViewHost.flushBackgroundTaskPostSyncWriteback('tab-bg', conversation);
    adaptedViewHost.markBackgroundTaskAuthoritativeSync(
      'tab-bg',
      'sync-event:message.updated',
    );
    adaptedViewHost.setTabNeedsAttention('tab-bg', true);

    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-bg',
    );
    expect(
      lateBoundPorts.backgroundTaskIndicatorCoordinator.flushCompletionNoticesAndSyncStreamLikeState,
    ).toHaveBeenCalledWith('tab-bg', conversation);
    expect(lateBoundPorts.backgroundTaskLiveSignalCoordinator.markAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:message.updated',
    );
    expect(lateBoundPorts.tabRuntimeStateBridge.setNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });

  it('derives background handoff hosts from one shared view host', async () => {
    const conversation = createConversation();
    const viewHost = createViewHost();

    const hosts = createBackgroundConversationPostSyncHandoffHosts(viewHost);

    hosts.backgroundTaskPostSyncRefreshPort.syncBackgroundTaskStateFromConversation(
      conversation,
      'tab-bg',
    );
    await hosts.backgroundTaskPostSyncRefreshPort.flushBackgroundTaskPostSyncWriteback(
      'tab-bg',
      conversation,
    );
    hosts.backgroundConversationSignalSyncStateCoordinatorHost.markBackgroundTaskAuthoritativeSync(
      'tab-bg',
      'sync-event:message.updated',
    );
    hosts.backgroundConversationAttentionCoordinatorHost.setTabNeedsAttention(
      'tab-bg',
      true,
    );

    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-bg',
    );
    expect(viewHost.flushBackgroundTaskPostSyncWriteback).toHaveBeenCalledWith(
      'tab-bg',
      conversation,
    );
    expect(viewHost.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:message.updated',
    );
    expect(viewHost.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });

  it('wires signal-sync refresh through the dedicated handoff bundle', async () => {
    const conversation = createConversation();
    const viewHost = createViewHost();
    const postSyncQuestionTodoRefreshPlanBuilder = {
      createBackgroundTabConversationPlan: jest.fn(),
      createSignalSyncedBackgroundConversationPlan: jest.fn().mockReturnValue({
        tabId: 'tab-bg',
        questionSessionId: 'session-conversation-bg',
        todoStatusSessionId: 'session-conversation-bg',
        forceTodoStatusRefresh: true,
      }),
    };
    const questionTodoStatusRefreshCoordinator = {
      refreshAfterPostSync: jest.fn().mockImplementation(
        async (
          options: {
            afterPendingQuestionRefresh?: (() => void | Promise<void>) | null;
          },
        ) => {
          await options.afterPendingQuestionRefresh?.();
        },
      ),
    };

    const { backgroundConversationPostSyncHandoffCoordinator } =
      createBackgroundConversationPostSyncHandoffServices(
        viewHost,
        postSyncQuestionTodoRefreshPlanBuilder,
        questionTodoStatusRefreshCoordinator,
      );

    await backgroundConversationPostSyncHandoffCoordinator.handleSignalSyncComplete({
      tabId: 'tab-bg',
      conversation,
      reason: 'session.diff',
      activeTabId: 'tab-active',
      tabHasBackgroundTask: true,
      previousFingerprint: 'old-fingerprint',
      syncResult: {
        changed: false,
        fingerprint: 'next-fingerprint',
      },
    });

    expect(
      postSyncQuestionTodoRefreshPlanBuilder.createSignalSyncedBackgroundConversationPlan,
    ).toHaveBeenCalledWith({
      tabId: 'tab-bg',
      conversation,
      tabHasBackgroundTask: true,
    });
    expect(questionTodoStatusRefreshCoordinator.refreshAfterPostSync).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 'tab-bg',
        questionSessionId: 'session-conversation-bg',
        todoStatusSessionId: 'session-conversation-bg',
        forceTodoStatusRefresh: true,
        afterPendingQuestionRefresh: expect.any(Function),
      }),
    );
    expect(viewHost.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-bg',
      'sync-event:session.diff',
    );
    expect(viewHost.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-bg',
    );
    expect(viewHost.flushBackgroundTaskPostSyncWriteback).toHaveBeenCalledWith(
      'tab-bg',
      conversation,
    );
    expect(viewHost.setTabNeedsAttention).toHaveBeenCalledWith('tab-bg', true);
  });
});
