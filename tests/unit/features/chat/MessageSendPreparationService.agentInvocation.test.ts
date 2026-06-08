import type {
  BuiltPromptSendPayload,
  PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';
import type { Conversation } from '../../../../src/core/types';
import type { ComposerSendContextPort } from '../../../../src/features/chat/services/ComposerContextViewFacade';
import {
  type MessageSendPreparationHost,
  MessageSendPreparationService,
} from '../../../../src/features/chat/services/MessageSendPreparationService';

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
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

type MockedHost = {
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

function createHost(conversation: Conversation): MockedHost {
  const host: MockedHost = {
    ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    ensureTabRuntime: jest.fn().mockReturnValue(true),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    notifyForegroundBusy: jest.fn(),
    getServerAvailability: jest.fn().mockResolvedValue('running'),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    refreshSettingsTabStatus: jest.fn(),
    getServerMode: jest.fn().mockReturnValue('local'),
    createAssistantShellContainer: jest.fn().mockReturnValue({
      messageEl: document.createElement('div'),
      contentEl: document.createElement('div'),
    }),
    getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
    finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
    finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
    openPluginSettingsAtServerSection: jest.fn(),
    startServer: jest.fn().mockResolvedValue(undefined),
    shouldUseModelCatalog: jest.fn().mockReturnValue(true),
    hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
    loadAvailableModels: jest.fn().mockResolvedValue(undefined),
    getSendMessageOptions: jest.fn().mockReturnValue({
      provider: 'openai',
      model: 'gpt-5.4',
    }),
    formatModelId: jest.fn().mockReturnValue('openai/gpt-5.4'),
    ensureSelectedModelAvailable: jest.fn().mockResolvedValue(true),
    appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
    buildStructuredPromptSendPayload: jest.fn().mockReturnValue(createStructuredSendPayload()),
    loadSkills: jest.fn().mockResolvedValue([]),
    seedCanonicalUserMessage: jest.fn(),
    resetBackgroundTaskIndicator: jest.fn(),
    armBackgroundTaskIndicatorForUserMessage: jest.fn(),
    startConversationSyncLoop: jest.fn(),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      targetConversation: Conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      await host.saveConversation(targetConversation);
      return true;
    }),
    setAutoScrollEnabled: jest.fn(),
    transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
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
  return host;
}

function createComposerSendContext(): MockedComposerSendContextPort {
  return {
    getDraftContextItems: jest.fn().mockReturnValue([]),
    resolvePersistentContextItems: jest.fn().mockResolvedValue([]),
    clearDraftContextItems: jest.fn(),
  };
}

describe('MessageSendPreparationService agent invocation', () => {
  it('maps explicit invocation intent into native prompt parts without changing the user bubble text', async () => {
    const conversation = createConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: 'Hello',
      invocationIntent: {
        kind: 'prompt',
        primaryAgent: 'plan',
        mentions: [
          {
            agentId: 'reviewer',
            source: {
              value: '@reviewer',
              start: 0,
              end: 9,
            },
          },
        ],
        subtasks: [
          {
            agentId: 'explorer',
            description: 'Audit routes',
            prompt: 'Inspect the router implementation',
          },
        ],
      },
    });

    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', {
      contextItems: [],
      invocationParts: [
        {
          type: 'agent',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 0,
            end: 9,
          },
        },
        {
          type: 'subtask',
          description: 'Audit routes',
          prompt: 'Inspect the router implementation',
          agent: 'explorer',
        },
      ],
    });
    expect(result?.resolvedAgentInvocation).toEqual({
      agent: 'plan',
      invocationParts: [
        {
          type: 'agent',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 0,
            end: 9,
          },
        },
        {
          type: 'subtask',
          description: 'Audit routes',
          prompt: 'Inspect the router implementation',
          agent: 'explorer',
        },
      ],
    });
    expect(result?.userMessage.content).toBe('Hello');
  });

  it('removes selected @agent mentions from the transport text while preserving the user bubble text', async () => {
    const conversation = createConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: 'please ask @reviewer to check this',
      invocationIntent: {
        kind: 'prompt',
        mentions: [
          {
            agentId: 'reviewer',
            source: {
              value: '@reviewer',
              start: 11,
              end: 20,
            },
          },
        ],
      },
    });

    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('please ask to check this', {
      contextItems: [],
      invocationParts: [
        {
          type: 'agent',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 11,
            end: 20,
          },
        },
      ],
    });
    expect(result?.userMessage.content).toBe('please ask @reviewer to check this');
  });
});

describe('MessageSendPreparationService agent invocation — Claude backend', () => {
  function createClaudeConversation(): Conversation {
    return {
      id: 'conversation-claude-1',
      title: 'Claude Conversation',
      createdAt: 1,
      updatedAt: 1,
      openCodeSessionId: 'claude-session-1',
      messages: [],
      backend: 'claude-code',
    };
  }

  it('preserves @agent mention text for Claude backend (no stripping)', async () => {
    const conversation = createClaudeConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    await service.prepareMessageSend({
      content: 'please ask @code-reviewer to check this',
      invocationIntent: {
        kind: 'prompt',
        mentions: [
          {
            agentId: 'code-reviewer',
            source: {
              value: '@code-reviewer',
              start: 11,
              end: 26,
            },
          },
        ],
      },
    });

    // For Claude backend, @agent text is preserved as raw text
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith(
      'please ask @code-reviewer to check this',
      expect.objectContaining({
        contextItems: [],
      }),
    );
    // No invocationParts should be sent
    const callArgs = host.buildStructuredPromptSendPayload.mock.calls[0];
    expect(callArgs?.[1]).not.toHaveProperty('invocationParts');
  });

  it('does not send invocationParts for Claude backend', async () => {
    const conversation = createClaudeConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    await service.prepareMessageSend({
      content: 'Hello @agent-a and @agent-b',
      invocationIntent: {
        kind: 'prompt',
        mentions: [
          {
            agentId: 'agent-a',
            source: { value: '@agent-a', start: 6, end: 14 },
          },
          {
            agentId: 'agent-b',
            source: { value: '@agent-b', start: 19, end: 27 },
          },
        ],
      },
    });

    const callArgs = host.buildStructuredPromptSendPayload.mock.calls[0];
    expect(callArgs?.[1]).not.toHaveProperty('invocationParts');
  });

  it('preserves primaryAgent in resolvedAgentInvocation for Claude backend', async () => {
    const conversation = createClaudeConversation();
    const host = createHost(conversation);
    const service = new MessageSendPreparationService(host, createComposerSendContext());

    const result = await service.prepareMessageSend({
      content: 'Hello',
      invocationIntent: {
        kind: 'prompt',
        primaryAgent: 'reviewer',
        mentions: [
          {
            agentId: 'reviewer',
            source: { value: '@reviewer', start: 0, end: 9 },
          },
        ],
      },
    });

    // resolvedAgentInvocation should still have the data for optimistic display
    expect(result?.resolvedAgentInvocation?.agent).toBe('reviewer');
    // But the transport text should preserve @reviewer
    expect(host.buildStructuredPromptSendPayload).toHaveBeenCalledWith('Hello', expect.objectContaining({
      contextItems: [],
    }));
  });
});
