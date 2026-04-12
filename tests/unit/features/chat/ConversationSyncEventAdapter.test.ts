import type { SessionSyncEventUpdate } from '../../../../src/core/opencode';
import { createEmptyTabContextState, type Conversation } from '../../../../src/core/types';
import {
  ConversationSyncEventAdapter,
  type ConversationSyncEventAdapterHost,
} from '../../../../src/features/chat/services/ConversationSyncEventAdapter';
import type { TabData } from '../../../../src/features/chat/tabs';

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

function createTab(overrides?: Partial<TabData>): TabData {
  return {
    id: 'tab-active',
    conversationId: 'conversation-active',
    title: 'Active tab',
    isActive: true,
    isStreaming: false,
    hasBackgroundTask: false,
    needsAttention: false,
    modelOverride: null,
    contextUsage: createEmptyTabContextState(),
    ...overrides,
  };
}

function createHost(options?: {
  activeTabId?: string | null;
  currentConversation?: Conversation | null;
  tabs?: TabData[];
  conversations?: Conversation[];
}) {
  const currentConversation = options?.currentConversation ?? createConversation('conversation-active');
  const tabs = options?.tabs ?? [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: 'conversation-hidden',
      title: 'Hidden tab',
      isActive: false,
      hasBackgroundTask: true,
    }),
  ];
  const conversations = options?.conversations ?? [
    currentConversation,
    createConversation('conversation-hidden'),
  ];
  let listener: ((update: SessionSyncEventUpdate) => void) | null = null;
  const disposeSubscription = jest.fn(() => {
    listener = null;
  });

  const host: Mocked<ConversationSyncEventAdapterHost> = {
    subscribeToSessionSyncEvents: jest.fn((nextListener) => {
      listener = nextListener;
      return disposeSubscription;
    }),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getConversations: jest.fn().mockReturnValue(conversations),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
    scheduleConversationSyncFromSignal: jest.fn(),
  };

  return {
    host,
    disposeSubscription,
    emit(update: SessionSyncEventUpdate) {
      listener?.(update);
    },
  };
}

describe('ConversationSyncEventAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owns session sync-event subscription cleanup across restarts', () => {
    const { host, disposeSubscription } = createHost();
    const adapter = new ConversationSyncEventAdapter(host);

    adapter.start();
    adapter.start();
    adapter.stop();

    expect(host.subscribeToSessionSyncEvents).toHaveBeenCalledTimes(2);
    expect(disposeSubscription).toHaveBeenCalledTimes(2);
  });

  it('routes session sync events to every tab sharing the same session', () => {
    const { host, emit } = createHost({
      conversations: [
        createConversation('conversation-active', { openCodeSessionId: 'session-shared' }),
        createConversation('conversation-hidden', { openCodeSessionId: 'session-shared' }),
        createConversation('conversation-other', { openCodeSessionId: 'session-other' }),
      ],
      tabs: [
        createTab({ id: 'tab-active', conversationId: 'conversation-active' }),
        createTab({
          id: 'tab-hidden',
          conversationId: 'conversation-hidden',
          title: 'Hidden tab',
          isActive: false,
        }),
        createTab({
          id: 'tab-other',
          conversationId: 'conversation-other',
          title: 'Other tab',
          isActive: false,
        }),
      ],
    });
    const adapter = new ConversationSyncEventAdapter(host);

    adapter.start();
    emit({
      sessionId: 'session-shared',
      type: 'message.updated',
      messageId: null,
    });

    expect(host.scheduleConversationSyncFromSignal).toHaveBeenCalledTimes(2);
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenNthCalledWith(1, 'tab-active', 'message.updated');
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenNthCalledWith(2, 'tab-hidden', 'message.updated');
  });

  it('falls back to the active tab when the current conversation matches the session', () => {
    const currentConversation = createConversation('conversation-active', {
      openCodeSessionId: 'session-active-only',
    });
    const { host, emit } = createHost({
      activeTabId: 'tab-active',
      currentConversation,
      conversations: [createConversation('conversation-other', { openCodeSessionId: 'session-other' })],
      tabs: [
        createTab({
          id: 'tab-other',
          conversationId: 'conversation-other',
          title: 'Other tab',
          isActive: false,
        }),
      ],
    });
    const adapter = new ConversationSyncEventAdapter(host);

    adapter.start();
    emit({
      sessionId: 'session-active-only',
      type: 'session.diff',
    });

    expect(host.scheduleConversationSyncFromSignal).toHaveBeenCalledTimes(1);
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenCalledWith('tab-active', 'session.diff');
  });
});
