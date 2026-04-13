import type {
  SessionActivityStatus,
} from '../../../../src/core/opencode';
import {
  createEmptyTabContextState,
  type Conversation,
  type SessionTodo,
} from '../../../../src/core/types';
import {
  createConversationSessionSignalRuntimeViewHost,
  type ConversationSessionSignalRuntimeViewHostFactoryHost,
} from '../../../../src/features/chat/services/ConversationSessionSignalRuntimeViewHostFactory';
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

  const host: Mocked<ConversationSessionSignalRuntimeViewHostFactoryHost> = {
    getSessionSignalSubscriptions: jest.fn(() => subscriptions),
    getSessionSignalWriteback: jest.fn(() => writeback),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getConversations: jest.fn().mockReturnValue(conversations),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    scheduleConversationSyncFromSignal: jest.fn(),
  };

  return {
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
    conversations,
  };
}

describe('ConversationSessionSignalRuntimeViewHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives the session-signal runtime host from one smaller factory seam', () => {
    const fixture = createFixture();
    const viewHost = createConversationSessionSignalRuntimeViewHost(fixture.host);
    const syncListener = jest.fn();
    const todoListener = jest.fn();
    const statusListener = jest.fn();
    const todos: SessionTodo[] = [{ id: 'todo-1', content: 'Finish task', status: 'in_progress' }];
    const status: SessionActivityStatus = { type: 'busy' };

    expect(viewHost.getAllTabs()).toEqual(fixture.tabs);
    expect(viewHost.getConversations()).toEqual(fixture.conversations);
    expect(viewHost.getCurrentConversation()).toEqual(fixture.currentConversation);
    expect(viewHost.getActiveTabId()).toBe('tab-active');
    expect(viewHost.subscribeToSessionSyncEvents(syncListener)).toBe(
      fixture.initialSubscriptions.subscribeToSessionSyncEvents.mock.results[0]?.value,
    );

    const nextSubscriptions = {
      subscribeToSessionSyncEvents: jest.fn(() => jest.fn()),
      subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
      subscribeToSessionStatusUpdates: jest.fn(() => jest.fn()),
    };
    const nextWriteback = {
      applySessionTodoUpdate: jest.fn<void, [string | null, string, SessionTodo[]]>(),
      applySessionStatusUpdate: jest.fn<void, [string | null, string, SessionActivityStatus]>(),
    };

    fixture.setSubscriptions(nextSubscriptions);
    fixture.setWriteback(nextWriteback);

    expect(viewHost.subscribeToSessionTodoUpdates(todoListener)).toBe(
      nextSubscriptions.subscribeToSessionTodoUpdates.mock.results[0]?.value,
    );
    expect(viewHost.subscribeToSessionStatusUpdates(statusListener)).toBe(
      nextSubscriptions.subscribeToSessionStatusUpdates.mock.results[0]?.value,
    );

    viewHost.scheduleConversationSyncFromSignal('tab-hidden', 'session.diff');
    viewHost.applySessionTodoUpdate('tab-active', 'session-shared', todos);
    viewHost.applySessionStatusUpdate('tab-hidden', 'session-shared', status);

    expect(fixture.host.scheduleConversationSyncFromSignal).toHaveBeenCalledWith(
      'tab-hidden',
      'session.diff',
    );
    expect(nextWriteback.applySessionTodoUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-shared',
      todos,
    );
    expect(nextWriteback.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-hidden',
      'session-shared',
      status,
    );
    expect(fixture.host.getSessionSignalSubscriptions).toHaveBeenCalledTimes(3);
    expect(fixture.host.getSessionSignalWriteback).toHaveBeenCalledTimes(2);
  });
});
