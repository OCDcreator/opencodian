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
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-active');
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
});
