import type {
  ChatMessage,
  Conversation,
  PromptContextItem,
} from '../../../../src/core/types';
import {
  buildOptimisticUserMessage,
  type MessageSendPreparationHost,
  MessageSendPreparationService,
} from '../../../../src/features/chat/services/MessageSendPreparationService';

function createConversation(messages: ChatMessage[] = []): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

function createPromptContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'context-1',
    kind: 'selection',
    path: 'notes/example.md',
    label: 'example.md:1-3',
    mime: 'text/markdown',
    lineRange: {
      startLine: 1,
      endLine: 3,
    },
    textSnapshot: 'Selected text',
    ...overrides,
  };
}

type MockedMessageSendPreparationHost = {
  [Key in keyof MessageSendPreparationHost]:
    MessageSendPreparationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageSendPreparationHost[Key];
};

function createHost(
  conversation: Conversation,
  callOrder: string[] = [],
  overrides: Partial<MockedMessageSendPreparationHost> = {},
): MockedMessageSendPreparationHost {
  return {
    ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    ensureTabRuntime: jest.fn().mockReturnValue(true),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    notifyForegroundBusy: jest.fn().mockImplementation(() => {
      callOrder.push('notifyForegroundBusy');
    }),
    getDraftContextItems: jest.fn().mockReturnValue([]),
    getServerAvailability: jest.fn().mockResolvedValue('running'),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    ensureServerReadyForChat: jest.fn().mockResolvedValue(true),
    hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
    loadAvailableModels: jest.fn().mockImplementation(async () => {
      callOrder.push('loadAvailableModels');
    }),
    getSendMessageOptions: jest.fn().mockReturnValue({
      provider: 'openai',
      model: 'gpt-5.4',
    }),
    formatModelId: jest.fn().mockImplementation((model) => (
      model?.provider && model?.model
        ? `${model.provider}/${model.model}`
        : undefined
    )),
    ensureSelectedModelAvailable: jest.fn().mockImplementation(async () => {
      callOrder.push('ensureSelectedModelAvailable');
      return true;
    }),
    appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
    resetBackgroundTaskIndicator: jest.fn().mockImplementation(() => {
      callOrder.push('resetBackgroundTaskIndicator');
    }),
    armBackgroundTaskIndicatorForUserMessage: jest.fn().mockImplementation(() => {
      callOrder.push('armBackgroundTaskIndicatorForUserMessage');
    }),
    startConversationSyncLoop: jest.fn().mockImplementation(() => {
      callOrder.push('startConversationSyncLoop');
    }),
    saveConversation: jest.fn().mockImplementation(async () => {
      callOrder.push('saveConversation');
    }),
    setAutoScrollEnabled: jest.fn().mockImplementation(() => {
      callOrder.push('setAutoScrollEnabled');
    }),
    renderMessage: jest.fn().mockImplementation(async () => {
      callOrder.push('renderMessage');
    }),
    scrollToBottom: jest.fn().mockImplementation(() => {
      callOrder.push('scrollToBottom');
    }),
    applyFallbackConversationTitle: jest.fn().mockImplementation(async () => {
      callOrder.push('applyFallbackConversationTitle');
    }),
    shouldGenerateAiTitle: jest.fn().mockReturnValue(false),
    startAiConversationTitleGeneration: jest.fn().mockImplementation(() => {
      callOrder.push('startAiConversationTitleGeneration');
    }),
    setStreaming: jest.fn().mockImplementation(() => {
      callOrder.push('setStreaming');
    }),
    syncTabStreamLikeState: jest.fn().mockImplementation(() => {
      callOrder.push('syncTabStreamLikeState');
    }),
    beginTabContextUsageStream: jest.fn().mockImplementation(() => {
      callOrder.push('beginTabContextUsageStream');
    }),
    clearPendingEditedFiles: jest.fn().mockImplementation(() => {
      callOrder.push('clearPendingEditedFiles');
    }),
    clearDraftContextItems: jest.fn().mockImplementation(() => {
      callOrder.push('clearDraftContextItems');
    }),
    ...overrides,
  };
}

describe('buildOptimisticUserMessage', () => {
  it('builds a user message with context attachments', () => {
    const contextItem = createPromptContextItem();

    const message = buildOptimisticUserMessage('Hello', [contextItem], 123);

    expect(message).toEqual({
      id: 'user-123',
      role: 'user',
      content: 'Hello',
      timestamp: 123,
      contextAttachments: [{
        kind: 'selection',
        path: 'notes/example.md',
        label: 'example.md:1-3',
        mime: 'text/markdown',
        lineRange: {
          startLine: 1,
          endLine: 3,
        },
        textSnapshot: 'Selected text',
      }],
    });
  });
});

describe('MessageSendPreparationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aborts before optimistic append when server readiness check fails', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], {
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
      ensureServerReadyForChat: jest.fn().mockResolvedValue(false),
    });
    const service = new MessageSendPreparationService(host);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(host.ensureServerReadyForChat).toHaveBeenCalledWith('offline');
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(0);
  });

  it('loads the model catalog before model availability checks when needed', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(conversation, callOrder, {
      hasLoadedModelCatalog: jest.fn().mockReturnValue(false),
    });
    const service = new MessageSendPreparationService(host);

    await service.prepareMessageSend({ content: 'Hello' });

    expect(callOrder.indexOf('loadAvailableModels')).toBeLessThan(
      callOrder.indexOf('ensureSelectedModelAvailable'),
    );
  });

  it('appends a model-unavailable notice path and aborts before optimistic append', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], {
      ensureSelectedModelAvailable: jest.fn().mockResolvedValue(false),
    });
    const service = new MessageSendPreparationService(host);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(host.appendModelUnavailableNoticeMessage).toHaveBeenCalledTimes(1);
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(0);
  });

  it('persists and renders the optimistic user message before first-message title kickoff', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const contextItem = createPromptContextItem();
    const host = createHost(conversation, callOrder, {
      getDraftContextItems: jest.fn().mockReturnValue([contextItem]),
      shouldGenerateAiTitle: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(result?.activeModelId).toBe('openai/gpt-5.4');
    expect(result?.userMessage.contextAttachments).toEqual([{
      kind: 'selection',
      path: 'notes/example.md',
      label: 'example.md:1-3',
      mime: 'text/markdown',
      lineRange: {
        startLine: 1,
        endLine: 3,
      },
      textSnapshot: 'Selected text',
    }]);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toBe(result?.userMessage);
    expect(conversation.updatedAt).toBe(result?.userMessage.timestamp);
    expect(callOrder).toEqual([
      'ensureSelectedModelAvailable',
      'resetBackgroundTaskIndicator',
      'armBackgroundTaskIndicatorForUserMessage',
      'startConversationSyncLoop',
      'saveConversation',
      'setAutoScrollEnabled',
      'renderMessage',
      'scrollToBottom',
      'applyFallbackConversationTitle',
      'startAiConversationTitleGeneration',
    ]);
  });

  it('blocks preparation when the active tab is already busy', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(conversation, callOrder, {
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(host.notifyForegroundBusy).toHaveBeenCalledTimes(1);
    expect(host.getServerAvailability).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['notifyForegroundBusy']);
  });

  it('enters streaming state and clears staged input state in the existing order', () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(conversation, callOrder);
    const service = new MessageSendPreparationService(host);

    service.enterStreamingState('tab-1');
    service.completePreparedStreamStart('tab-1');

    expect(callOrder).toEqual([
      'setStreaming',
      'syncTabStreamLikeState',
      'beginTabContextUsageStream',
      'clearPendingEditedFiles',
      'clearDraftContextItems',
    ]);
  });
});
