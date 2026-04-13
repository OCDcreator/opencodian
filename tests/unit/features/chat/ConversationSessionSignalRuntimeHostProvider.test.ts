import type {
  SessionActivityStatus,
} from '../../../../src/core/opencode';
import {
  createEmptyTabContextState,
  type Conversation,
  type SessionTodo,
} from '../../../../src/core/types';
import {
  createConversationSessionSignalRuntimeViewHostFactoryHost,
  type ConversationSessionSignalRuntimeHostProviderHost,
} from '../../../../src/features/chat/services/ConversationSessionSignalRuntimeHostProvider';
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

function createFixture() {
  const currentConversation = createConversation('conversation-active');
  const hiddenConversation = createConversation('conversation-hidden');
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
  const initialSubscriptions = {
    subscribeToSessionSyncEvents: jest.fn(() => jest.fn()),
    subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
    subscribeToSessionStatusUpdates: jest.fn(() => jest.fn()),
  };
  const initialWriteback = {
    applySessionTodoUpdate: jest.fn<void, [string | null, string, SessionTodo[]]>(),
    applySessionStatusUpdate: jest.fn<void, [string | null, string, SessionActivityStatus]>(),
  };
  let subscriptions = initialSubscriptions;
  let writeback = initialWriteback;

  const host: Mocked<ConversationSessionSignalRuntimeHostProviderHost> = {
    subscribeToSessionSyncEvents: jest.fn((listener) =>
      subscriptions.subscribeToSessionSyncEvents(listener)),
    subscribeToSessionTodoUpdates: jest.fn((listener) =>
      subscriptions.subscribeToSessionTodoUpdates(listener)),
    subscribeToSessionStatusUpdates: jest.fn((listener) =>
      subscriptions.subscribeToSessionStatusUpdates(listener)),
    applySessionTodoUpdate: jest.fn((tabId, sessionId, todos) =>
      writeback.applySessionTodoUpdate(tabId, sessionId, todos)),
    applySessionStatusUpdate: jest.fn((tabId, sessionId, status) =>
      writeback.applySessionStatusUpdate(tabId, sessionId, status)),
    getAllTabs: jest.fn(() => tabs),
    getConversations: jest.fn(() => conversations),
    getCurrentConversation: jest.fn(() => currentConversation),
    getActiveTabId: jest.fn(() => 'tab-active'),
    scheduleConversationSyncFromSignal: jest.fn(),
  };

  return {
    conversations,
    currentConversation,
    host,
    initialSubscriptions,
    initialWriteback,
    setSubscriptions: (next: typeof initialSubscriptions) => {
      subscriptions = next;
    },
    setWriteback: (next: typeof initialWriteback) => {
      writeback = next;
    },
    tabs,
  };
}

describe('ConversationSessionSignalRuntimeHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin session-signal seam into the existing factory host ports', () => {
    const fixture = createFixture();
    const factoryHost = createConversationSessionSignalRuntimeViewHostFactoryHost(fixture.host);
    const subscriptions = factoryHost.getSessionSignalSubscriptions();
    const writeback = factoryHost.getSessionSignalWriteback();
    const syncListener = jest.fn();
    const todoListener = jest.fn();
    const statusListener = jest.fn();
    const todos: SessionTodo[] = [{ id: 'todo-1', content: 'Finish task', status: 'in_progress' }];
    const status: SessionActivityStatus = { type: 'busy' };

    expect(factoryHost.getAllTabs()).toEqual(fixture.tabs);
    expect(factoryHost.getConversations()).toEqual(fixture.conversations);
    expect(factoryHost.getCurrentConversation()).toEqual(fixture.currentConversation);
    expect(factoryHost.getActiveTabId()).toBe('tab-active');
    expect(subscriptions.subscribeToSessionSyncEvents(syncListener)).toBe(
      fixture.initialSubscriptions.subscribeToSessionSyncEvents.mock.results[0]?.value,
    );
    expect(subscriptions.subscribeToSessionTodoUpdates(todoListener)).toBe(
      fixture.initialSubscriptions.subscribeToSessionTodoUpdates.mock.results[0]?.value,
    );
    expect(subscriptions.subscribeToSessionStatusUpdates(statusListener)).toBe(
      fixture.initialSubscriptions.subscribeToSessionStatusUpdates.mock.results[0]?.value,
    );

    factoryHost.scheduleConversationSyncFromSignal('tab-hidden', 'session.diff');
    writeback.applySessionTodoUpdate('tab-active', 'session-shared', todos);
    writeback.applySessionStatusUpdate('tab-hidden', 'session-shared', status);

    expect(fixture.host.scheduleConversationSyncFromSignal).toHaveBeenCalledWith(
      'tab-hidden',
      'session.diff',
    );
    expect(fixture.host.applySessionTodoUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-shared',
      todos,
    );
    expect(fixture.host.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-hidden',
      'session-shared',
      status,
    );
  });

  it('keeps the grouped ports late-bound to the latest session-signal collaborators', () => {
    const fixture = createFixture();
    const factoryHost = createConversationSessionSignalRuntimeViewHostFactoryHost(fixture.host);
    const subscriptions = factoryHost.getSessionSignalSubscriptions();
    const writeback = factoryHost.getSessionSignalWriteback();
    const nextSubscriptions = {
      subscribeToSessionSyncEvents: jest.fn(() => jest.fn()),
      subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
      subscribeToSessionStatusUpdates: jest.fn(() => jest.fn()),
    };
    const nextWriteback = {
      applySessionTodoUpdate: jest.fn<void, [string | null, string, SessionTodo[]]>(),
      applySessionStatusUpdate: jest.fn<void, [string | null, string, SessionActivityStatus]>(),
    };
    const todoListener = jest.fn();
    const statusListener = jest.fn();
    const todos: SessionTodo[] = [{ id: 'todo-2', content: 'Ship slice', status: 'completed' }];
    const status: SessionActivityStatus = { type: 'idle' };

    fixture.setSubscriptions(nextSubscriptions);
    fixture.setWriteback(nextWriteback);

    expect(subscriptions.subscribeToSessionTodoUpdates(todoListener)).toBe(
      nextSubscriptions.subscribeToSessionTodoUpdates.mock.results[0]?.value,
    );
    expect(subscriptions.subscribeToSessionStatusUpdates(statusListener)).toBe(
      nextSubscriptions.subscribeToSessionStatusUpdates.mock.results[0]?.value,
    );

    writeback.applySessionTodoUpdate('tab-hidden', 'session-next', todos);
    writeback.applySessionStatusUpdate('tab-active', 'session-next', status);

    expect(fixture.host.subscribeToSessionTodoUpdates).toHaveBeenCalledWith(todoListener);
    expect(fixture.host.subscribeToSessionStatusUpdates).toHaveBeenCalledWith(statusListener);
    expect(nextWriteback.applySessionTodoUpdate).toHaveBeenCalledWith(
      'tab-hidden',
      'session-next',
      todos,
    );
    expect(nextWriteback.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-next',
      status,
    );
  });
});
