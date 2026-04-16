import {
  ConversationLoadRuntimeBridge,
  type ConversationLoadRuntimeBridgeHost,
} from '../../../../src/features/chat/runtime/ConversationLoadRuntimeBridge';

function createConversation(id: string, title = `Chat ${id}`) {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

function createHost(
  overrides: Partial<jest.Mocked<ConversationLoadRuntimeBridgeHost>> = {},
): jest.Mocked<ConversationLoadRuntimeBridgeHost> {
  return {
    loadConversations: jest.fn().mockResolvedValue(undefined),
    getConversationById: jest.fn().mockResolvedValue(null),
    shouldSyncConversationFromServer: jest.fn().mockReturnValue(false),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      messages: [],
      revertState: null,
    }),
    setCurrentConversationRevertState: jest.fn(),
    ...overrides,
  };
}

describe('ConversationLoadRuntimeBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reloads conversations before giving up on a missing loaded conversation', async () => {
    const conversation = createConversation('loaded');
    const host = createHost({
      getConversationById: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(conversation),
    });
    const bridge = new ConversationLoadRuntimeBridge(host);

    const result = await bridge.resolveConversation(conversation.id, {
      reloadIfMissing: true,
    });

    expect(result).toBe(conversation);
    expect(host.getConversationById).toHaveBeenCalledTimes(2);
    expect(host.loadConversations).toHaveBeenCalledTimes(1);
  });

  it('does not reload streaming activation lookups by default', async () => {
    const conversation = createConversation('streaming');
    const host = createHost({
      getConversationById: jest.fn().mockResolvedValue(conversation),
    });
    const bridge = new ConversationLoadRuntimeBridge(host);

    const result = await bridge.resolveConversation(conversation.id);

    expect(result).toBe(conversation);
    expect(host.getConversationById).toHaveBeenCalledTimes(1);
    expect(host.loadConversations).not.toHaveBeenCalled();
  });

  it('syncs loaded-conversation messages through the host when required', async () => {
    const conversation = createConversation('sync-target');
    const syncedMessages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Synced reply',
        timestamp: 1,
      },
    ];
    const revertState = {
      messageID: 'assistant-1',
    };
    const host = createHost({
      shouldSyncConversationFromServer: jest.fn().mockReturnValue(true),
      syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
        messages: syncedMessages,
        revertState,
      }),
    });
    const bridge = new ConversationLoadRuntimeBridge(host);

    const messages = await bridge.loadConversationMessages(conversation, 'tab-1', {
      forceServerSync: true,
    });

    expect(messages).toBe(syncedMessages);
    expect(host.shouldSyncConversationFromServer).toHaveBeenCalledWith(conversation, {
      forceServerSync: true,
    });
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'load-conversation',
    );
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith(revertState);
  });
});
