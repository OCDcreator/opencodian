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
  return {
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
