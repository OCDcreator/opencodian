import type {
  BuiltPromptSendPayload,
  PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';
import type {
  ChatMessage,
  Conversation,
  PromptContextItem,
} from '../../../../src/core/types';
import type { ComposerSendContextPort } from '../../../../src/features/chat/services/ComposerContextViewFacade';
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

function createStructuredSendPayload(
  overrides: Partial<BuiltPromptSendPayload> = {},
): BuiltPromptSendPayload {
  const requestParts: PromptRequestPart[] = overrides.requestParts ?? [
    { id: 'part-1', type: 'text', text: 'Hello' },
  ];

  return {
    messageID: overrides.messageID ?? 'message-1',
    requestParts,
    optimisticUserParts: overrides.optimisticUserParts ?? requestParts.map((part) => ({ ...part })),
  };
}

type MockedMessageSendPreparationHost = {
  [Key in keyof MessageSendPreparationHost]:
    MessageSendPreparationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageSendPreparationHost[Key];
};

type MockedComposerSendContextPort = {
  [Key in keyof ComposerSendContextPort]:
    ComposerSendContextPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ComposerSendContextPort[Key];
};

function createComposerSendContext(
  callOrder: string[] = [],
  overrides: Partial<MockedComposerSendContextPort> = {},
): MockedComposerSendContextPort {
  return {
    getDraftContextItems: jest.fn().mockReturnValue([]),
    resolvePersistentContextItems: jest.fn().mockResolvedValue([]),
    clearDraftContextItems: jest.fn().mockImplementation(() => {
      callOrder.push('clearDraftContextItems');
    }),
    ...overrides,
  };
}

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
    buildStructuredPromptSendPayload: jest.fn().mockImplementation((content: string) =>
      createStructuredSendPayload({
        requestParts: [{ id: 'part-1', type: 'text', text: content }],
      })),
    seedCanonicalUserMessage: jest.fn().mockImplementation(() => {
      callOrder.push('seedCanonicalUserMessage');
    }),
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
    ...overrides,
  };
}

describe('buildOptimisticUserMessage', () => {
  it('builds a user message with context attachments', () => {
    const contextItem = createPromptContextItem();
    const optimisticUserParts: PromptRequestPart[] = [
      { id: 'part-1', type: 'text', text: 'Hello' },
    ];

    const message = buildOptimisticUserMessage('Hello', [contextItem], 123, {
      optimisticUserParts,
    });

    expect(message).toEqual({
      id: 'user-123',
      role: 'user',
      content: 'Hello',
      timestamp: 123,
      parts: optimisticUserParts,
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
    const service = new MessageSendPreparationService(host, createComposerSendContext());

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
    const service = new MessageSendPreparationService(host, createComposerSendContext(callOrder));

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
    const service = new MessageSendPreparationService(host, createComposerSendContext());

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
      shouldGenerateAiTitle: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(
      host,
      createComposerSendContext(callOrder, {
        getDraftContextItems: jest.fn().mockReturnValue([contextItem]),
      }),
    );

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(result?.messageID).toBe('message-1');
    expect(result?.requestParts).toEqual([
      { id: 'part-1', type: 'text', text: 'Hello' },
    ]);
    expect(result?.optimisticUserParts).toEqual([
      { id: 'part-1', type: 'text', text: 'Hello' },
    ]);
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
      'seedCanonicalUserMessage',
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

  it('resolves persistent conversation context paths and merges them with draft context', async () => {
    const conversation = createConversation();
    conversation.externalContextPaths = ['notes/guide.md', 'notes/example.md'];

    const persistentContextItem = createPromptContextItem({
      id: 'context-persistent',
      kind: 'file',
      path: 'notes/guide.md',
      label: 'guide.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const duplicatePersistentItem = createPromptContextItem({
      id: 'context-persistent-duplicate',
      kind: 'file',
      path: 'notes/example.md',
      label: 'example.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const draftContextItem = createPromptContextItem({
      id: 'context-draft',
      kind: 'current_note',
      path: 'notes/example.md',
      label: 'example.md',
      lineRange: undefined,
      textSnapshot: undefined,
    });
    const host = createHost(conversation);
    const composerSendContext = createComposerSendContext([], {
      getDraftContextItems: jest.fn().mockReturnValue([draftContextItem]),
      resolvePersistentContextItems: jest.fn().mockResolvedValue([
        persistentContextItem,
        duplicatePersistentItem,
      ]),
    });
    const service = new MessageSendPreparationService(host, composerSendContext);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(composerSendContext.resolvePersistentContextItems).toHaveBeenCalledWith([
      'notes/guide.md',
      'notes/example.md',
    ]);
    expect(result?.draftContextItems).toEqual([draftContextItem]);
    expect(result?.contextItems).toEqual([
      persistentContextItem,
      draftContextItem,
    ]);
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', {
      contextItems: [
        persistentContextItem,
        draftContextItem,
      ],
    });
    expect(result?.userMessage.contextAttachments).toEqual([
      {
        kind: 'file',
        path: 'notes/guide.md',
        label: 'guide.md',
        mime: 'text/markdown',
      },
      {
        kind: 'current_note',
        path: 'notes/example.md',
        label: 'example.md',
        mime: 'text/markdown',
      },
    ]);
    expect(host.seedCanonicalUserMessage).toHaveBeenCalledWith({
      sessionID: 'session-1',
      messageID: 'message-1',
      parts: [{ id: 'part-1', type: 'text', text: 'Hello' }],
      timestamp: result?.userMessage.timestamp,
    });
  });

  it('blocks preparation when the active tab is already busy', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(conversation, callOrder, {
      isTabForegroundBusy: jest.fn().mockReturnValue(true),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext(callOrder));

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
    const service = new MessageSendPreparationService(
      host,
      createComposerSendContext(callOrder),
    );

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
