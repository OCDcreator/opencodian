import type {
  PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';
import {
  MessageSendPreparationService,
} from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  createComposerSendContext,
  createConversation,
  createHost,
  createPromptContextItem,
  createStructuredSendPayload,
} from './MessageSendPreparationService.testSupport';

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
    expect(host.ensureConversationReady).not.toHaveBeenCalled();
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(conversation.messages).toHaveLength(0);

    ensureReadySpy.mockRestore();
  });

  it('does not create a conversation before prompting when no backend is enabled', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], {
      getServerAvailability: jest.fn().mockResolvedValue('disabled'),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const ensureReadySpy = jest.spyOn(service, 'ensureServerReadyForChat').mockResolvedValue(false);

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(ensureReadySpy).toHaveBeenCalledWith('disabled');
    expect(host.ensureConversationReady).not.toHaveBeenCalled();

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

  it('uses Claude Code model catalog options for Claude Code conversations', async () => {
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-code-session';
    delete conversation.openCodeSessionId;
    const host = createHost(conversation, [], {
      hasLoadedModelCatalog: jest.fn().mockReturnValue(false),
      getSendMessageOptions: jest.fn().mockReturnValue({
        provider: 'claude-code',
        model: 'opus',
        variant: 'xhigh',
      }),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({ content: 'Hello Claude' });

    expect(result).not.toBeNull();
    expect(host.loadAvailableModels).toHaveBeenCalledTimes(1);
    expect(host.getSendMessageOptions).toHaveBeenCalledTimes(1);
    expect(host.ensureSelectedModelAvailable).toHaveBeenCalledWith('claude-code', 'opus');
    expect(host.appendModelUnavailableNoticeMessage).not.toHaveBeenCalled();
    expect(result?.modelOptions).toEqual({
      provider: 'claude-code',
      model: 'opus',
      variant: 'xhigh',
    });
    expect(result?.activeModelId).toBe('claude-code/opus');
    expect(host.seedCanonicalUserMessage).toHaveBeenCalledWith({
      sessionID: 'claude-code-session',
      messageID: 'message-1',
      parts: [{ id: 'part-1', type: 'text', text: 'Hello Claude' }],
      timestamp: result?.userMessage.timestamp,
    });
  });

  it('preserves images through the preparation pipeline', async () => {
    const conversation = createConversation();
    const images = [
      { data: 'iVBORw0KGgo=', mediaType: 'image/png' as const, filename: 'test.png' },
    ];
    const host = createHost(conversation, []);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({ content: 'Hello', images });

    expect(result).not.toBeNull();
    expect(result?.images).toEqual(images);
    expect(result?.userMessage.images).toEqual(images);
  });

  it('merges one-shot outputFormat into modelOptions when provided', async () => {
    const conversation = createConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());
    const outputFormat = { type: 'json_schema', schema: { type: 'object' } };

    const result = await service.prepareMessageSend({ content: 'Hello', outputFormat });

    expect(result).not.toBeNull();
    expect(result?.modelOptions).toEqual(expect.objectContaining({ outputFormat }));
  });

  it('does not add outputFormat to modelOptions when not provided', async () => {
    const conversation = createConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).not.toBeNull();
    expect(result?.modelOptions).not.toHaveProperty('outputFormat');
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
      'getServerAvailability',
      'transitionTabSessionLifecycle:preparing',
      'getServerAvailability',
      'refreshSettingsTabStatus',
      'ensureSelectedModelAvailable',
      'saveConversation',
      'seedCanonicalUserMessage',
      'resetBackgroundTaskIndicator',
      'armBackgroundTaskIndicatorForUserMessage',
      'startConversationSyncLoop',
      'setAutoScrollEnabled',
      'renderMessage',
      'scrollToBottom',
      'applyFallbackConversationTitle',
      'startAiConversationTitleGeneration',
    ]);
  });

  it('aborts optimistic user write side effects when the serialized commit is skipped', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation();
    const host = createHost(conversation, callOrder, {
      commitConversationWrite: jest.fn().mockResolvedValue(false),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext(callOrder));

    const result = await service.prepareMessageSend({ content: 'Hello' });

    expect(result).toBeNull();
    expect(conversation.messages).toHaveLength(0);
    expect(host.createConversationWriteTicket).toHaveBeenCalledWith(conversation.id);
    expect(host.commitConversationWrite).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({ conversationId: conversation.id }),
      'optimistic-user-message',
      expect.any(Function),
    );
    expect(host.seedCanonicalUserMessage).not.toHaveBeenCalled();
    expect(host.renderMessage).not.toHaveBeenCalled();
    expect(host.transitionTabSessionLifecycle).toHaveBeenCalledWith(
      'tab-1',
      'idle',
      'send-preflight-aborted',
    );
  });
});

describe('MessageSendPreparationService context preparation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    // Early disabled-backend guard calls getServerAvailability before the busy check.
    expect(host.getServerAvailability).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['getServerAvailability', 'notifyForegroundBusy']);
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
      'transitionTabSessionLifecycle:streaming',
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

describe('MessageSendPreparationService skill expansion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expands skill references into synthetic text parts while keeping user bubble original', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], {
      loadSkills: jest.fn().mockResolvedValue([
        { name: 'analyze', description: 'Analyze content', location: '', content: 'Analyze the given content' },
      ]),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: '/analyze this file',
    });

    expect(host.loadSkills).toHaveBeenCalled();
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith(
      '/analyze this file',
      expect.objectContaining({
        syntheticTextParts: expect.arrayContaining([
          expect.objectContaining({
            text: '<skill_content name="analyze">\nAnalyze the given content\n</skill_content>',
            metadata: { kind: 'skill-expansion', skillName: 'analyze' },
          }),
        ]),
      }),
    );
    expect(result?.userMessage.content).toBe('/analyze this file');
  });

  it('ignores unknown slash tokens and does not add synthetic parts', async () => {
    const conversation = createConversation();
    const host = createHost(conversation, [], {
      loadSkills: jest.fn().mockResolvedValue([]),
    });
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: '/unknown this file',
    });

    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith(
      '/unknown this file',
      expect.not.objectContaining({ syntheticTextParts: expect.anything() }),
    );
    expect(result?.userMessage.content).toBe('/unknown this file');
  });
});
