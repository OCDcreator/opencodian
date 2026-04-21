import type {
  SessionActivityStatus,
  SessionSyncEventUpdate,
} from '../../../../src/core/opencode';
import {
  type Conversation,
  createEmptyTabContextState,
  type SessionTodo,
} from '../../../../src/core/types';
import {
  ConversationSessionSignalRuntime,
  type ConversationSessionSignalRuntimeHost,
} from '../../../../src/features/chat/services/ConversationSessionSignalRuntime';
import type { TabData } from '../../../../src/features/chat/tabs';

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

function createHost(): {
  backgroundTaskLiveSignalCoordinator: { reconcileStateFromLiveSignals: jest.Mock<void, [string | null]> };
  disposeSessionSyncEvents: jest.Mock<void, []>;
  disposeSessionStatusUpdates: jest.Mock<void, []>;
  disposeSessionTodoUpdates: jest.Mock<void, []>;
  emitSessionStatusUpdate: (sessionId: string, status: SessionActivityStatus) => void;
  emitSessionSyncEvent: (update: SessionSyncEventUpdate) => void;
  emitSessionTodoUpdate: (sessionId: string, todos: SessionTodo[]) => void;
  host: Mocked<ConversationSessionSignalRuntimeHost>;
} {
  const currentConversation = createConversation('conversation-active', {
    openCodeSessionId: 'session-shared',
  });
  const hiddenConversation = createConversation('conversation-hidden', {
    openCodeSessionId: 'session-shared',
  });
  const tabs = [
    createTab(),
    createTab({
      id: 'tab-hidden',
      conversationId: hiddenConversation.id,
      title: 'Hidden tab',
      isActive: false,
    }),
  ];
  const conversations = [currentConversation, hiddenConversation];
  let syncEventListener: ((update: SessionSyncEventUpdate) => void) | null = null;
  let todoUpdateListener: ((update: { sessionId: string; todos: SessionTodo[] }) => void) | null = null;
  let statusUpdateListener: ((update: { sessionId: string; status: SessionActivityStatus }) => void) | null = null;
  const disposeSessionSyncEvents = jest.fn(() => {
    syncEventListener = null;
  });
  const disposeSessionTodoUpdates = jest.fn(() => {
    todoUpdateListener = null;
  });
  const disposeSessionStatusUpdates = jest.fn(() => {
    statusUpdateListener = null;
  });

  return {
    backgroundTaskLiveSignalCoordinator: {
      reconcileStateFromLiveSignals: jest.fn(),
    },
    disposeSessionSyncEvents,
    disposeSessionStatusUpdates,
    disposeSessionTodoUpdates,
    emitSessionStatusUpdate(sessionId, status) {
      statusUpdateListener?.({ sessionId, status });
    },
    emitSessionSyncEvent(update) {
      syncEventListener?.(update);
    },
    emitSessionTodoUpdate(sessionId, todos) {
      todoUpdateListener?.({ sessionId, todos });
    },
    host: {
      subscribeToSessionSyncEvents: jest.fn((listener) => {
        syncEventListener = listener;
        return disposeSessionSyncEvents;
      }),
      subscribeToSessionTodoUpdates: jest.fn((listener) => {
        todoUpdateListener = listener;
        return disposeSessionTodoUpdates;
      }),
      subscribeToSessionStatusUpdates: jest.fn((listener) => {
        statusUpdateListener = listener;
        return disposeSessionStatusUpdates;
      }),
      getAllTabs: jest.fn().mockReturnValue(tabs),
      getConversations: jest.fn().mockReturnValue(conversations),
      getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
      getActiveTabId: jest.fn().mockReturnValue('tab-active'),
      applySessionSyncEvent: jest.fn(),
      applySessionDiffUpdate: jest.fn(),
      applySessionTodoUpdate: jest.fn(),
      applySessionStatusUpdate: jest.fn(),
    },
  };
}

describe('ConversationSessionSignalRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owns all session-signal subscription cleanup across restarts', () => {
    const {
      backgroundTaskLiveSignalCoordinator,
      disposeSessionSyncEvents,
      disposeSessionStatusUpdates,
      disposeSessionTodoUpdates,
      host,
    } = createHost();
    const runtime = new ConversationSessionSignalRuntime(host, backgroundTaskLiveSignalCoordinator);

    runtime.start();
    runtime.start();
    runtime.stop();

    expect(host.subscribeToSessionTodoUpdates).toHaveBeenCalledTimes(2);
    expect(host.subscribeToSessionStatusUpdates).toHaveBeenCalledTimes(2);
    expect(host.subscribeToSessionSyncEvents).toHaveBeenCalledTimes(2);
    expect(disposeSessionTodoUpdates).toHaveBeenCalledTimes(2);
    expect(disposeSessionStatusUpdates).toHaveBeenCalledTimes(2);
    expect(disposeSessionSyncEvents).toHaveBeenCalledTimes(2);
  });

  it('routes sync, todo, and status signals through one runtime owner', () => {
    const {
      backgroundTaskLiveSignalCoordinator,
      disposeSessionSyncEvents,
      disposeSessionStatusUpdates,
      disposeSessionTodoUpdates,
      emitSessionStatusUpdate,
      emitSessionSyncEvent,
      emitSessionTodoUpdate,
      host,
    } = createHost();
    const todos: SessionTodo[] = [{ id: 'todo-1', content: 'Finish task', status: 'in_progress' }];
    const runtime = new ConversationSessionSignalRuntime(host, backgroundTaskLiveSignalCoordinator);

    runtime.start();
    emitSessionSyncEvent({
      sessionId: 'session-shared',
      type: 'session.diff',
      diff: [{ file: 'notes.md', additions: 2, deletions: 1 }],
    });
    emitSessionTodoUpdate('session-shared', todos);
    emitSessionStatusUpdate('session-shared', { type: 'busy' });
    runtime.stop();

    expect(host.subscribeToSessionSyncEvents).toHaveBeenCalledTimes(1);
    expect(host.subscribeToSessionTodoUpdates).toHaveBeenCalledTimes(1);
    expect(host.subscribeToSessionStatusUpdates).toHaveBeenCalledTimes(1);
    expect(host.applySessionSyncEvent).not.toHaveBeenCalled();
    expect(host.applySessionDiffUpdate).toHaveBeenCalledTimes(2);
    expect(host.applySessionDiffUpdate).toHaveBeenNthCalledWith(1, 'tab-active', {
      sessionId: 'session-shared',
      type: 'session.diff',
      diff: [{ file: 'notes.md', additions: 2, deletions: 1 }],
    });
    expect(host.applySessionDiffUpdate).toHaveBeenNthCalledWith(2, 'tab-hidden', {
      sessionId: 'session-shared',
      type: 'session.diff',
      diff: [{ file: 'notes.md', additions: 2, deletions: 1 }],
    });
    expect(host.applySessionTodoUpdate).toHaveBeenCalledTimes(2);
    expect(host.applySessionTodoUpdate).toHaveBeenNthCalledWith(1, 'tab-active', 'session-shared', todos);
    expect(host.applySessionTodoUpdate).toHaveBeenNthCalledWith(2, 'tab-hidden', 'session-shared', todos);
    expect(host.applySessionStatusUpdate).toHaveBeenCalledTimes(2);
    expect(host.applySessionStatusUpdate).toHaveBeenNthCalledWith(
      1,
      'tab-active',
      'session-shared',
      { type: 'busy' },
    );
    expect(host.applySessionStatusUpdate).toHaveBeenNthCalledWith(
      2,
      'tab-hidden',
      'session-shared',
      { type: 'busy' },
    );
    expect(backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals).toHaveBeenCalledTimes(4);
    expect(disposeSessionSyncEvents).toHaveBeenCalledTimes(1);
    expect(disposeSessionTodoUpdates).toHaveBeenCalledTimes(1);
    expect(disposeSessionStatusUpdates).toHaveBeenCalledTimes(1);
  });

  it('falls back to the active tab when the current conversation still matches the session', () => {
    const currentConversation = createConversation('conversation-active', {
      openCodeSessionId: 'session-active-only',
    });
    const { backgroundTaskLiveSignalCoordinator, emitSessionStatusUpdate, emitSessionSyncEvent, host } = createHost();
    host.getCurrentConversation.mockReturnValue(currentConversation);
    host.getConversations.mockReturnValue([
      createConversation('conversation-other', { openCodeSessionId: 'session-other' }),
    ]);
    host.getAllTabs.mockReturnValue([
      createTab({
        id: 'tab-other',
        conversationId: 'conversation-other',
        title: 'Other tab',
        isActive: false,
      }),
    ]);
    host.getActiveTabId.mockReturnValue('tab-active');
    const runtime = new ConversationSessionSignalRuntime(host, backgroundTaskLiveSignalCoordinator);

    runtime.start();
    const syncEvent: SessionSyncEventUpdate = {
      sessionId: 'session-active-only',
      type: 'message.updated',
      info: {
        id: 'msg-1',
        sessionID: 'session-active-only',
        role: 'assistant',
        time: { created: 1 },
      },
    };
    emitSessionSyncEvent(syncEvent);
    emitSessionStatusUpdate('session-active-only', { type: 'busy' });

    expect(host.applySessionSyncEvent).toHaveBeenCalledTimes(1);
    expect(host.applySessionSyncEvent).toHaveBeenCalledWith(
      'tab-active',
      syncEvent,
    );
    expect(host.applySessionStatusUpdate).toHaveBeenCalledTimes(1);
    expect(host.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-active-only',
      { type: 'busy' },
    );
    expect(backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals).toHaveBeenCalledWith(
      'tab-active',
    );
  });
});
