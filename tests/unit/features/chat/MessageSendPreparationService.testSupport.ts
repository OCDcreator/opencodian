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
  type MessageSendPreparationHost,
  type MessageSendPreparationHostDependencies,
} from '../../../../src/features/chat/services/MessageSendPreparationService';

export function createPromptContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'context-1',
    kind: 'selection',
    path: 'notes/example.md',
    label: 'example.md:1-3',
    mime: 'text/markdown',
    lineRange: { startLine: 1, endLine: 3 },
    textSnapshot: 'Selected text',
    ...overrides,
  };
}

export function createConversation(messages: ChatMessage[] = []): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

export function createStructuredSendPayload(
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

export type MockedMessageSendPreparationHost = {
  [Key in keyof MessageSendPreparationHost]:
    MessageSendPreparationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageSendPreparationHost[Key];
};

export type MockedMessageSendPreparationHostDependencies = {
  [Key in keyof MessageSendPreparationHostDependencies]:
    MessageSendPreparationHostDependencies[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageSendPreparationHostDependencies[Key];
};

export type MockedComposerSendContextPort = {
  [Key in keyof ComposerSendContextPort]:
    ComposerSendContextPort[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ComposerSendContextPort[Key];
};

export function createComposerSendContext(
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

export function createHost(
  conversation: Conversation,
  callOrder: string[] = [],
  overrides: Partial<MockedMessageSendPreparationHost> = {},
): MockedMessageSendPreparationHost {
  const host: MockedMessageSendPreparationHost = {
    ensureConversationReady: jest.fn().mockResolvedValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    ensureTabRuntime: jest.fn().mockReturnValue(true),
    isTabForegroundBusy: jest.fn().mockReturnValue(false),
    queueFollowUpSend: jest.fn().mockReturnValue(false),
    consumeQueuedFollowUpSend: jest.fn().mockReturnValue(null),
    notifyForegroundBusy: jest.fn().mockImplementation(() => { callOrder.push('notifyForegroundBusy'); }),
    getServerAvailability: jest.fn().mockImplementation(async () => { callOrder.push('getServerAvailability'); return 'running'; }),
    refreshServerStatusBadge: jest.fn().mockResolvedValue(undefined),
    refreshSettingsTabStatus: jest.fn().mockImplementation(() => { callOrder.push('refreshSettingsTabStatus'); }),
    getServerMode: jest.fn().mockReturnValue('local'),
    createAssistantShellContainer: jest.fn().mockReturnValue({ messageEl: document.createElement('div'), contentEl: document.createElement('div') }),
    getUnavailableServerPromptMessage: jest.fn().mockReturnValue('Server is offline'),
    finalizeAssistantMessageWithServerError: jest.fn().mockResolvedValue(undefined),
    finalizeAssistantMessageWithServerUnavailableError: jest.fn().mockResolvedValue(undefined),
    openPluginSettingsAtServerSection: jest.fn().mockImplementation(() => { callOrder.push('openPluginSettingsAtServerSection'); }),
    startServer: jest.fn().mockResolvedValue(undefined),
    hasLoadedModelCatalog: jest.fn().mockReturnValue(true),
    loadAvailableModels: jest.fn().mockImplementation(async () => { callOrder.push('loadAvailableModels'); }),
    getSendMessageOptions: jest.fn().mockReturnValue({ provider: 'openai', model: 'gpt-5.4' }),
    formatModelId: jest.fn().mockImplementation((model: Partial<{ provider: string; model: string }> | null | undefined) =>
      model?.provider && model?.model ? `${model.provider}/${model.model}` : undefined),
    shouldUseModelCatalog: jest.fn().mockImplementation((targetConversation: Conversation) =>
      (targetConversation.backend ?? 'opencode') === 'opencode'
      || (targetConversation.backend ?? 'opencode') === 'claude-code'),
    ensureSelectedModelAvailable: jest.fn().mockImplementation(async () => { callOrder.push('ensureSelectedModelAvailable'); return true; }),
    appendModelUnavailableNoticeMessage: jest.fn().mockResolvedValue(undefined),
    buildStructuredPromptSendPayload: jest.fn().mockImplementation((content: string) =>
      createStructuredSendPayload({ requestParts: [{ id: 'part-1', type: 'text', text: content }] })),
    loadSkills: jest.fn().mockResolvedValue([]),
    seedCanonicalUserMessage: jest.fn().mockImplementation(() => { callOrder.push('seedCanonicalUserMessage'); }),
    resetBackgroundTaskIndicator: jest.fn().mockImplementation(() => { callOrder.push('resetBackgroundTaskIndicator'); }),
    armBackgroundTaskIndicatorForUserMessage: jest.fn().mockImplementation(() => { callOrder.push('armBackgroundTaskIndicatorForUserMessage'); }),
    startConversationSyncLoop: jest.fn().mockImplementation(() => { callOrder.push('startConversationSyncLoop'); }),
    saveConversation: jest.fn().mockImplementation(async () => { callOrder.push('saveConversation'); }),
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
    setAutoScrollEnabled: jest.fn().mockImplementation(() => { callOrder.push('setAutoScrollEnabled'); }),
    transitionTabSessionLifecycle: jest.fn().mockImplementation((_tabId, phase) => {
      callOrder.push(`transitionTabSessionLifecycle:${phase}`);
      return true;
    }),
    renderMessage: jest.fn().mockImplementation(async () => { callOrder.push('renderMessage'); }),
    scrollToBottom: jest.fn().mockImplementation(() => { callOrder.push('scrollToBottom'); }),
    applyFallbackConversationTitle: jest.fn().mockImplementation(async () => { callOrder.push('applyFallbackConversationTitle'); }),
    shouldGenerateAiTitle: jest.fn().mockReturnValue(false),
    startAiConversationTitleGeneration: jest.fn().mockImplementation(() => { callOrder.push('startAiConversationTitleGeneration'); }),
    setStreaming: jest.fn().mockImplementation(() => { callOrder.push('setStreaming'); }),
    syncTabStreamLikeState: jest.fn().mockImplementation(() => { callOrder.push('syncTabStreamLikeState'); }),
    beginTabContextUsageStream: jest.fn().mockImplementation(() => { callOrder.push('beginTabContextUsageStream'); }),
    clearPendingEditedFiles: jest.fn().mockImplementation(() => { callOrder.push('clearPendingEditedFiles'); }),
    ...overrides,
  };
  return host;
}
