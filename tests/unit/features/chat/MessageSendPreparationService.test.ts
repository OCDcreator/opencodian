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
    refreshSettingsTabStatus: jest.fn().mockImplementation(() => {
      callOrder.push('refreshSettingsTabStatus');
    }),
    getServerMode: jest.fn().mockReturnValue('local'),
    createAssistantShellContainer: jest.fn().mockReturnValue({
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    }),
    getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
    finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
    finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
    openPluginSettingsAtServerSection: jest.fn().mockImplementation(() => {
      callOrder.push('openPluginSettingsAtServerSection');
    }),
    startServer: jest.fn().mockResolvedValue(undefined),
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
    const mockMessageEl = document.createElement('div');
    const mockContentEl = document.createElement('div');
    const host = createHost(conversation, [], {
      getServerAvailability: jest.fn()
        .mockResolvedValueOnce('offline')
        .mockResolvedValueOnce('offline'),
      createAssistantShellContainer: jest.fn().mockReturnValue({
        messageEl: mockMessageEl,
        contentEl: mockContentEl,
      }),
      getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
      getServerMode: jest.fn().mockReturnValue('local'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const ensureReadySpy = jest.spyOn(service, 'ensureServerReadyForChat').mockResolvedValue(false);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(ensureReadySpy).toHaveBeenCalledWith('offline');
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(0);

    ensureReadySpy.mockRestore();
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
});

describe('MessageSendPreparationService optimistic preparation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      'refreshSettingsTabStatus',
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

  it('passes synthetic prompt parts through the structured send builder without changing user content', async () => {
    const conversation = createConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const syntheticTextParts = [
      {
        text: 'Injected plugin prompt',
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      },
    ];

    const result = await service.prepareMessageSend({
      content: 'Hello',
      syntheticTextParts,
    });

    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', {
      contextItems: [],
      syntheticTextParts,
    });
    expect(result?.userMessage.content).toBe('Hello');
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

describe('MessageSendPreparationService synthetic part canonical seeding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeds canonical user state with synthetic optimistic parts while keeping the user bubble text-only', async () => {
    const conversation = createConversation();
    const requestParts: PromptRequestPart[] = [
      { id: 'part-visible', type: 'text', text: 'Hello' },
      {
        id: 'part-plugin',
        type: 'text',
        text: 'Injected plugin prompt',
        synthetic: true,
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      },
    ];
    const host = createHost(conversation, [], {
      buildStructuredPromptSendPayload: jest.fn().mockReturnValue(
        createStructuredSendPayload({
          requestParts,
          optimisticUserParts: requestParts,
        }),
      ),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const syntheticTextParts = [
      {
        text: 'Injected plugin prompt',
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      },
    ];

    const result = await service.prepareMessageSend({
      content: 'Hello',
      syntheticTextParts,
    });

    expect(host.seedCanonicalUserMessage).toHaveBeenCalledWith({
      sessionID: 'session-1',
      messageID: 'message-1',
      parts: requestParts,
      timestamp: result?.userMessage.timestamp,
    });
    expect(result?.userMessage.content).toBe('Hello');
    expect(result?.userMessage.parts).toEqual(requestParts);
    expect(result?.userMessage.content).not.toContain('Injected plugin prompt');
  });
});

describe('MessageSendPreparationService ensureServerReadyForChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createServerReadinessHost(
    overrides: Partial<MockedMessageSendPreparationHost> = {},
  ): { host: MockedMessageSendPreparationHost; container: { messageEl: HTMLElement; contentEl: HTMLElement } } {
    const container = {
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    };
    const host: MockedMessageSendPreparationHost = {
      ensureConversationReady: jest.fn().mockResolvedValue(createConversation()),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      ensureTabRuntime: jest.fn().mockReturnValue(true),
      isTabForegroundBusy: jest.fn().mockReturnValue(false),
      notifyForegroundBusy: jest.fn(),
      getServerAvailability: jest.fn().mockResolvedValue('running'),
      refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
      refreshSettingsTabStatus: jest.fn(),
      getServerMode: jest.fn().mockReturnValue('local'),
      createAssistantShellContainer: jest.fn().mockReturnValue(container),
      getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
      finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
      finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
      openPluginSettingsAtServerSection: jest.fn(),
      startServer: jest.fn().mockResolvedValue(undefined),
      hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
      loadAvailableModels: jest.fn().mockResolvedValue(undefined),
      getSendMessageOptions: jest.fn().mockReturnValue({ provider: 'openai', model: 'gpt-5.4' }),
      formatModelId: jest.fn().mockReturnValue('openai/gpt-5.4'),
      ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
      appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
      buildStructuredPromptSendPayload: jest.fn().mockReturnValue(createStructuredSendPayload()),
      seedCanonicalUserMessage: jest.fn(),
      resetBackgroundTaskIndicator: jest.fn(),
      armBackgroundTaskIndicatorForUserMessage: jest.fn(),
      startConversationSyncLoop: jest.fn(),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      setAutoScrollEnabled: jest.fn(),
      renderMessage: jest.fn().mockResolvedValue(undefined),
      scrollToBottom: jest.fn(),
      applyFallbackConversationTitle: jest.fn().mockResolvedValue(undefined),
      shouldGenerateAiTitle: jest.fn().mockReturnValue(false),
      startAiConversationTitleGeneration: jest.fn(),
      setStreaming: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
      beginTabContextUsageStream: jest.fn(),
      clearPendingEditedFiles: jest.fn(),
      ...overrides,
    };
    return { host, container };
  }

  function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
    const buttons = container.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent === text) return btn as HTMLButtonElement;
    }
    return null;
  }

  function simulateButtonClickAfterRender(
    container: HTMLElement,
    buttonLabel: string,
  ): void {
    const btn = findButtonByText(container, buttonLabel);
    if (!btn) {
      const allButtons = container.querySelectorAll('button');
      throw new Error(`Button "${buttonLabel}" not found. Available: ${[...allButtons].map(b => b.textContent).join(', ')}`);
    }
    btn.click();
  }

  it('returns true on successful server start (start button)', async () => {
    const { host, container } = createServerReadinessHost();
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Start service');

    const result = await resultPromise;

    expect(result).toBe(true);
    expect(host.startServer).toHaveBeenCalled();
    expect(host.refreshServerStatusBadge).toHaveBeenCalled();
    expect(host.refreshSettingsTabStatus).toHaveBeenCalled();
    expect(host.scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-1', enableAutoScroll: true });
  });

  it('returns false and finalizes with server error when start throws', async () => {
    const { host, container } = createServerReadinessHost({
      startServer: jest.fn().mockRejectedValue(new Error('Binary not found')),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Start service');

    const result = await resultPromise;

    expect(result).toBe(false);
    expect(host.finalizeAssistantMessageWithServerError).toHaveBeenCalled();
  });

  it('returns true when skip is chosen and server becomes running', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('running'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Not now');

    const result = await resultPromise;

    expect(result).toBe(true);
    expect(host.startServer).not.toHaveBeenCalled();
  });

  it('returns false when skip is chosen and server stays offline', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Not now');

    const result = await resultPromise;

    expect(result).toBe(false);
    expect(host.finalizeAssistantMessageWithServerUnavailableError).toHaveBeenCalled();
  });

  it('returns true when settings is chosen and server becomes running', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('running'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Open settings');

    const result = await resultPromise;

    expect(result).toBe(true);
    expect(host.openPluginSettingsAtServerSection).toHaveBeenCalled();
    expect(host.startServer).not.toHaveBeenCalled();
  });

  it('returns false when settings is chosen and server stays offline', async () => {
    const { host, container } = createServerReadinessHost({
      getServerAvailability: jest.fn().mockResolvedValue('offline'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const resultPromise = service.ensureServerReadyForChat('offline');

    await new Promise((resolve) => setTimeout(resolve, 0));
    simulateButtonClickAfterRender(container.contentEl, 'Open settings');

    const result = await resultPromise;

    expect(result).toBe(false);
    expect(host.openPluginSettingsAtServerSection).toHaveBeenCalled();
    expect(host.finalizeAssistantMessageWithServerUnavailableError).toHaveBeenCalled();
  });
});

describe('MessageSendPreparationService createServerReadinessDelegate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a delegate that delegates to ensureServerReadyForChat', async () => {
    const container = {
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    };
    const host: MockedMessageSendPreparationHost = {
      ensureConversationReady: jest.fn().mockResolvedValue(createConversation()),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      ensureTabRuntime: jest.fn().mockReturnValue(true),
      isTabForegroundBusy: jest.fn().mockReturnValue(false),
      notifyForegroundBusy: jest.fn(),
      getServerAvailability: jest.fn().mockResolvedValue('running'),
      refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
      refreshSettingsTabStatus: jest.fn(),
      getServerMode: jest.fn().mockReturnValue('local'),
      createAssistantShellContainer: jest.fn().mockReturnValue(container),
      getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
      finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
      finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
      openPluginSettingsAtServerSection: jest.fn(),
      startServer: jest.fn().mockResolvedValue(undefined),
      hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
      loadAvailableModels: jest.fn().mockResolvedValue(undefined),
      getSendMessageOptions: jest.fn().mockReturnValue({}),
      formatModelId: jest.fn().mockReturnValue(undefined),
      ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
      appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
      buildStructuredPromptSendPayload: jest.fn().mockReturnValue(createStructuredSendPayload()),
      seedCanonicalUserMessage: jest.fn(),
      resetBackgroundTaskIndicator: jest.fn(),
      armBackgroundTaskIndicatorForUserMessage: jest.fn(),
      startConversationSyncLoop: jest.fn(),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      setAutoScrollEnabled: jest.fn(),
      renderMessage: jest.fn().mockResolvedValue(undefined),
      scrollToBottom: jest.fn(),
      applyFallbackConversationTitle: jest.fn().mockResolvedValue(undefined),
      shouldGenerateAiTitle: jest.fn().mockReturnValue(false),
      startAiConversationTitleGeneration: jest.fn(),
      setStreaming: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
      beginTabContextUsageStream: jest.fn(),
      clearPendingEditedFiles: jest.fn(),
    };
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const delegate = service.createServerReadinessDelegate();

    expect(delegate).toHaveProperty('ensureServerReadyForChat');
    expect(typeof delegate.ensureServerReadyForChat).toBe('function');
  });

  it('delegate calls ensureServerReadyForChat on the service', async () => {
    const container = {
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    };
    const host: MockedMessageSendPreparationHost = {
      ensureConversationReady: jest.fn().mockResolvedValue(createConversation()),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      ensureTabRuntime: jest.fn().mockReturnValue(true),
      isTabForegroundBusy: jest.fn().mockReturnValue(false),
      notifyForegroundBusy: jest.fn(),
      getServerAvailability: jest.fn().mockResolvedValue('running'),
      refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
      refreshSettingsTabStatus: jest.fn(),
      getServerMode: jest.fn().mockReturnValue('local'),
      createAssistantShellContainer: jest.fn().mockReturnValue(container),
      getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
      finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
      finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
      openPluginSettingsAtServerSection: jest.fn(),
      startServer: jest.fn().mockResolvedValue(undefined),
      hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
      loadAvailableModels: jest.fn().mockResolvedValue(undefined),
      getSendMessageOptions: jest.fn().mockReturnValue({}),
      formatModelId: jest.fn().mockReturnValue(undefined),
      ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
      appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
      buildStructuredPromptSendPayload: jest.fn().mockReturnValue(createStructuredSendPayload()),
      seedCanonicalUserMessage: jest.fn(),
      resetBackgroundTaskIndicator: jest.fn(),
      armBackgroundTaskIndicatorForUserMessage: jest.fn(),
      startConversationSyncLoop: jest.fn(),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      setAutoScrollEnabled: jest.fn(),
      renderMessage: jest.fn().mockResolvedValue(undefined),
      scrollToBottom: jest.fn(),
      applyFallbackConversationTitle: jest.fn().mockResolvedValue(undefined),
      shouldGenerateAiTitle: jest.fn().mockReturnValue(false),
      startAiConversationTitleGeneration: jest.fn(),
      setStreaming: jest.fn(),
      syncTabStreamLikeState: jest.fn(),
      beginTabContextUsageStream: jest.fn(),
      clearPendingEditedFiles: jest.fn(),
    };
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const spy = jest.spyOn(service, 'ensureServerReadyForChat').mockResolvedValue(true);
    const delegate = service.createServerReadinessDelegate();

    const result = await delegate.ensureServerReadyForChat('offline');

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith('offline');
  });
});
