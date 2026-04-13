import type {
  SessionActivityStatus,
  SessionSyncEventUpdate,
} from '../../../../src/core/opencode';
import {
  createEmptyTabContextState,
  type Conversation,
  type SessionTodo,
} from '../../../../src/core/types';
import {
  ConversationSessionSignalRuntime,
  createConversationSessionSignalRuntime,
} from '../../../../src/features/chat/services/ConversationSessionSignalRuntime';
import type {
  ConversationSyncEventLiveSignalHostAdapterHost,
} from '../../../../src/features/chat/services/ConversationSyncEventLiveSignalHostAdapter';
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
  host: Mocked<ConversationSyncEventLiveSignalHostAdapterHost>;
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
      scheduleConversationSyncFromSignal: jest.fn(),
      applySessionTodoUpdate: jest.fn(),
      applySessionStatusUpdate: jest.fn(),
    },
  };
}

describe('ConversationSessionSignalRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts and stops live-signal before sync-event adapters', () => {
    const liveSignalAdapter = { start: jest.fn(), stop: jest.fn() };
    const syncEventAdapter = { start: jest.fn(), stop: jest.fn() };
    const runtime = new ConversationSessionSignalRuntime(liveSignalAdapter, syncEventAdapter);

    runtime.start();
    runtime.stop();

    expect(liveSignalAdapter.start).toHaveBeenCalledTimes(1);
    expect(syncEventAdapter.start).toHaveBeenCalledTimes(1);
    expect(liveSignalAdapter.stop).toHaveBeenCalledTimes(1);
    expect(syncEventAdapter.stop).toHaveBeenCalledTimes(1);
    expect(liveSignalAdapter.start.mock.invocationCallOrder[0]).toBeLessThan(
      syncEventAdapter.start.mock.invocationCallOrder[0],
    );
    expect(liveSignalAdapter.stop.mock.invocationCallOrder[0]).toBeLessThan(
      syncEventAdapter.stop.mock.invocationCallOrder[0],
    );
  });

  it('assembles sync-event and live-signal routing behind one runtime seam', () => {
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
    const runtime = createConversationSessionSignalRuntime(host, backgroundTaskLiveSignalCoordinator);

    runtime.start();
    emitSessionSyncEvent({ sessionId: 'session-shared', type: 'session.diff' });
    emitSessionTodoUpdate('session-shared', todos);
    emitSessionStatusUpdate('session-shared', { type: 'busy' });
    runtime.stop();

    expect(host.subscribeToSessionSyncEvents).toHaveBeenCalledTimes(1);
    expect(host.subscribeToSessionTodoUpdates).toHaveBeenCalledTimes(1);
    expect(host.subscribeToSessionStatusUpdates).toHaveBeenCalledTimes(1);
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenCalledTimes(2);
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenNthCalledWith(1, 'tab-active', 'session.diff');
    expect(host.scheduleConversationSyncFromSignal).toHaveBeenNthCalledWith(2, 'tab-hidden', 'session.diff');
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
});
