import type { ChatMessage, Conversation } from '../../../../src/core/types';
import {
  type ConversationSyncVisiblePostSyncResult,
  ConversationSyncVisiblePostSyncRouter,
  type ConversationSyncVisiblePostSyncRouterHost,
} from '../../../../src/features/chat/services/ConversationSyncVisiblePostSyncRouter';
import type { VisibleConversationPostSyncCoordinator } from '../../../../src/features/chat/services/VisibleConversationPostSyncCoordinator';

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

function createHost(): Mocked<ConversationSyncVisiblePostSyncRouterHost> {
  return {
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
  };
}

type VisibleConversationPostSyncPort = Pick<
  VisibleConversationPostSyncCoordinator,
  'handleVisibleConversationSyncComplete'
>;

function createCoordinator(): Mocked<VisibleConversationPostSyncPort> {
  return {
    handleVisibleConversationSyncComplete: jest.fn().mockResolvedValue({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    }),
  };
}

function createSyncResult(
  conversation: Conversation,
  overrides?: Partial<ConversationSyncVisiblePostSyncResult>,
): ConversationSyncVisiblePostSyncResult {
  return {
    messages: conversation.messages,
    changed: true,
    fingerprint: `fingerprint-${conversation.id}`,
    revertState: null,
    ...overrides,
  };
}

describe('ConversationSyncVisiblePostSyncRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shapes visible post-sync requests and applies synced conversation updates', async () => {
    const previousMessages = [
      {
        id: 'assistant-prev',
        role: 'assistant',
        content: 'before',
        timestamp: 1,
      } as ChatMessage,
    ];
    const conversation = createConversation('visible', {
      messages: [
        {
          id: 'assistant-next',
          role: 'assistant',
          content: 'after',
          timestamp: 2,
        } as ChatMessage,
      ],
    });
    const host = createHost();
    const coordinator = createCoordinator();
    const router = new ConversationSyncVisiblePostSyncRouter(host, coordinator);

    await router.routeVisibleSyncComplete({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages,
      syncResult: createSyncResult(conversation, {
        fingerprint: 'visible-fingerprint',
        revertState: { messageID: 'assistant-next' },
      }),
    });

    expect(coordinator.handleVisibleConversationSyncComplete).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'visible',
      questionSessionId: 'session-visible',
      isCurrent: expect.any(Function),
      syncResult: {
        changed: true,
        messages: conversation.messages,
        fingerprint: 'visible-fingerprint',
        revertState: { messageID: 'assistant-next' },
      },
    });
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      previousMessages,
      conversation.messages,
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
  });

  it('renders the background-task indicator when visible post-sync skips DOM patching', async () => {
    const conversation = createConversation('visible');
    const host = createHost();
    const coordinator = createCoordinator();
    coordinator.handleVisibleConversationSyncComplete.mockResolvedValue({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const router = new ConversationSyncVisiblePostSyncRouter(host, coordinator);

    await router.routeVisibleSyncComplete({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: [],
      syncResult: createSyncResult(conversation, {
        changed: false,
        fingerprint: 'visible-same',
      }),
    });

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith(
      'tab-active',
      { isCurrent: expect.any(Function) },
    );
  });

  it('skips question/todo refresh for non-OpenCode conversations and applies sync directly', async () => {
    const conversation = createConversation('claude-visible', {
      backend: 'claude-code',
      backendSessionId: 'claude-session-1',
      messages: [
        {
          id: 'assistant-claude',
          role: 'assistant',
          content: 'claude response',
          timestamp: 2,
        } as ChatMessage,
      ],
    });
    const host = createHost();
    const coordinator = createCoordinator();
    const router = new ConversationSyncVisiblePostSyncRouter(host, coordinator);

    await router.routeVisibleSyncComplete({
      syncContext: {
        tabId: 'tab-active',
        conversation,
      },
      previousMessages: [],
      syncResult: createSyncResult(conversation),
    });

    // Non-OpenCode: skip coordinator entirely, apply synced update directly
    expect(coordinator.handleVisibleConversationSyncComplete).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      [],
      conversation.messages,
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
  });

  it('does not write a stale visible result after the active pane switches during post-sync await', async () => {
    const conversationA = createConversation('conversation-a');
    const conversationB = createConversation('conversation-b');
    const state = {
      activeTabId: 'tab-a',
      conversationId: conversationA.id,
      paneGeneration: 1,
    };
    const host = createHost();
    host.captureVisiblePostSyncIdentity = jest.fn(() => ({
      isCurrent: () => state.activeTabId === 'tab-a'
        && state.conversationId === conversationA.id
        && state.paneGeneration === 1,
    }));
    let resolvePostSync: ((value: {
      shouldApplySyncedConversationUpdate: boolean;
      shouldRenderBackgroundTaskIndicator: boolean;
    }) => void) | undefined;
    const deferred = new Promise<{
      shouldApplySyncedConversationUpdate: boolean;
      shouldRenderBackgroundTaskIndicator: boolean;
    }>((resolve) => {
      resolvePostSync = resolve;
    });
    const coordinator = createCoordinator();
    coordinator.handleVisibleConversationSyncComplete.mockReturnValue(deferred);
    const router = new ConversationSyncVisiblePostSyncRouter(host, coordinator);
    const routePromise = router.routeVisibleSyncComplete({
      syncContext: { tabId: 'tab-a', conversation: conversationA },
      previousMessages: [],
      syncResult: createSyncResult(conversationA),
    });

    state.activeTabId = 'tab-b';
    state.conversationId = conversationB.id;
    state.paneGeneration = 2;
    resolvePostSync?.({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
    await routePromise;

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
  });
});
