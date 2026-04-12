import type { SessionActivityStatus } from '../../../../src/core/opencode';
import { createEmptyTabContextState, type Conversation, type SessionTodo } from '../../../../src/core/types';
import {
  ConversationSessionLiveSignalAdapter,
  type ConversationSessionLiveSignalAdapterHost,
} from '../../../../src/features/chat/services/ConversationSessionLiveSignalAdapter';
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
  let todoListener: ((update: { sessionId: string; todos: SessionTodo[] }) => void) | null = null;
  let statusListener: ((update: { sessionId: string; status: SessionActivityStatus }) => void) | null = null;
  const disposeTodoSubscription = jest.fn(() => {
    todoListener = null;
  });
  const disposeStatusSubscription = jest.fn(() => {
    statusListener = null;
  });

  const host: Mocked<ConversationSessionLiveSignalAdapterHost> = {
    subscribeToSessionTodoUpdates: jest.fn((nextListener) => {
      todoListener = nextListener;
      return disposeTodoSubscription;
    }),
    subscribeToSessionStatusUpdates: jest.fn((nextListener) => {
      statusListener = nextListener;
      return disposeStatusSubscription;
    }),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getConversations: jest.fn().mockReturnValue(conversations),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
    applySessionTodoUpdate: jest.fn(),
    applySessionStatusUpdate: jest.fn(),
  };
  const backgroundTaskLiveSignalCoordinator = {
    reconcileStateFromLiveSignals: jest.fn(),
  };

  return {
    host,
    backgroundTaskLiveSignalCoordinator,
    disposeTodoSubscription,
    disposeStatusSubscription,
    emitTodo(sessionId: string, todos: SessionTodo[]) {
      todoListener?.({ sessionId, todos });
    },
    emitStatus(sessionId: string, status: SessionActivityStatus) {
      statusListener?.({ sessionId, status });
    },
  };
}

describe('ConversationSessionLiveSignalAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owns todo and status subscription cleanup across restarts', () => {
    const {
      host,
      backgroundTaskLiveSignalCoordinator,
      disposeTodoSubscription,
      disposeStatusSubscription,
    } = createHost();
    const adapter = new ConversationSessionLiveSignalAdapter(host, backgroundTaskLiveSignalCoordinator);

    adapter.start();
    adapter.start();
    adapter.stop();

    expect(host.subscribeToSessionTodoUpdates).toHaveBeenCalledTimes(2);
    expect(host.subscribeToSessionStatusUpdates).toHaveBeenCalledTimes(2);
    expect(disposeTodoSubscription).toHaveBeenCalledTimes(2);
    expect(disposeStatusSubscription).toHaveBeenCalledTimes(2);
  });

  it('routes todo updates to every tab sharing the same session', () => {
    const todos: SessionTodo[] = [{ id: 'todo-1', content: 'Finish task', status: 'in_progress' }];
    const { host, backgroundTaskLiveSignalCoordinator, emitTodo } = createHost({
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
    const adapter = new ConversationSessionLiveSignalAdapter(host, backgroundTaskLiveSignalCoordinator);

    adapter.start();
    emitTodo('session-shared', todos);

    expect(host.applySessionTodoUpdate).toHaveBeenCalledTimes(2);
    expect(host.applySessionTodoUpdate).toHaveBeenNthCalledWith(1, 'tab-active', 'session-shared', todos);
    expect(host.applySessionTodoUpdate).toHaveBeenNthCalledWith(2, 'tab-hidden', 'session-shared', todos);
    expect(backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals).toHaveBeenCalledTimes(2);
    expect(
      backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals,
    ).toHaveBeenNthCalledWith(1, 'tab-active');
    expect(
      backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals,
    ).toHaveBeenNthCalledWith(2, 'tab-hidden');
  });

  it('falls back to the active tab for status updates when the current conversation matches the session', () => {
    const status: SessionActivityStatus = { type: 'busy' };
    const currentConversation = createConversation('conversation-active', {
      openCodeSessionId: 'session-active-only',
    });
    const { host, backgroundTaskLiveSignalCoordinator, emitStatus } = createHost({
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
    const adapter = new ConversationSessionLiveSignalAdapter(host, backgroundTaskLiveSignalCoordinator);

    adapter.start();
    emitStatus('session-active-only', status);

    expect(host.applySessionStatusUpdate).toHaveBeenCalledTimes(1);
    expect(host.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-active-only',
      status,
    );
    expect(
      backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals,
    ).toHaveBeenCalledWith('tab-active');
  });
});
