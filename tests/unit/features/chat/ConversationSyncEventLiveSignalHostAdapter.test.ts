import {
  createEmptyTabContextState,
  type Conversation,
  type SessionTodo,
} from '../../../../src/core/types';
import {
  createConversationSyncEventLiveSignalHosts,
  type ConversationSyncEventLiveSignalHostAdapterHost,
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

function createHost(): Mocked<ConversationSyncEventLiveSignalHostAdapterHost> {
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

  return {
    subscribeToSessionSyncEvents: jest.fn(() => jest.fn()),
    subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
    subscribeToSessionStatusUpdates: jest.fn(() => jest.fn()),
    getAllTabs: jest.fn().mockReturnValue(tabs),
    getConversations: jest.fn().mockReturnValue(conversations),
    getCurrentConversation: jest.fn().mockReturnValue(currentConversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    scheduleConversationSyncFromSignal: jest.fn(),
    applySessionTodoUpdate: jest.fn(),
    applySessionStatusUpdate: jest.fn(),
  };
}

describe('ConversationSyncEventLiveSignalHostAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives sync-event and live-signal hosts from one shared seam', () => {
    const host = createHost();
    const {
      conversationSyncEventAdapterHost,
      conversationSessionLiveSignalAdapterHost,
    } = createConversationSyncEventLiveSignalHosts(host);
    const todoPayload: SessionTodo[] = [{ id: 'todo-1', content: 'Finish task', status: 'in_progress' }];
    const syncListener = jest.fn();
    const todoListener = jest.fn();
    const statusListener = jest.fn();

    expect(conversationSyncEventAdapterHost.getAllTabs()).toEqual(host.getAllTabs());
    expect(conversationSessionLiveSignalAdapterHost.getAllTabs()).toEqual(host.getAllTabs());
    expect(conversationSyncEventAdapterHost.getConversations()).toEqual(host.getConversations());
    expect(conversationSessionLiveSignalAdapterHost.getConversations()).toEqual(host.getConversations());
    expect(conversationSyncEventAdapterHost.getCurrentConversation()).toEqual(host.getCurrentConversation());
    expect(
      conversationSessionLiveSignalAdapterHost.getCurrentConversation(),
    ).toEqual(host.getCurrentConversation());
    expect(conversationSyncEventAdapterHost.getActiveTabId()).toBe('tab-active');
    expect(conversationSessionLiveSignalAdapterHost.getActiveTabId()).toBe('tab-active');

    expect(
      conversationSyncEventAdapterHost.subscribeToSessionSyncEvents(syncListener),
    ).toBe(host.subscribeToSessionSyncEvents.mock.results[0]?.value);
    expect(
      conversationSessionLiveSignalAdapterHost.subscribeToSessionTodoUpdates(todoListener),
    ).toBe(host.subscribeToSessionTodoUpdates.mock.results[0]?.value);
    expect(
      conversationSessionLiveSignalAdapterHost.subscribeToSessionStatusUpdates(statusListener),
    ).toBe(host.subscribeToSessionStatusUpdates.mock.results[0]?.value);

    conversationSyncEventAdapterHost.scheduleConversationSyncFromSignal('tab-active', 'session.diff');
    conversationSessionLiveSignalAdapterHost.applySessionTodoUpdate(
      'tab-hidden',
      'session-hidden',
      todoPayload,
    );
    conversationSessionLiveSignalAdapterHost.applySessionStatusUpdate(
      'tab-active',
      'session-active',
      { type: 'busy' },
    );

    expect(host.scheduleConversationSyncFromSignal).toHaveBeenCalledWith('tab-active', 'session.diff');
    expect(host.applySessionTodoUpdate).toHaveBeenCalledWith(
      'tab-hidden',
      'session-hidden',
      todoPayload,
    );
    expect(host.applySessionStatusUpdate).toHaveBeenCalledWith(
      'tab-active',
      'session-active',
      { type: 'busy' },
    );
    expect('applySessionTodoUpdate' in conversationSyncEventAdapterHost).toBe(false);
    expect('scheduleConversationSyncFromSignal' in conversationSessionLiveSignalAdapterHost).toBe(false);
  });
});
