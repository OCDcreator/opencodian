import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  getFriendlyServerStartErrorMessage,
  getUnavailableServerMessage,
  type MessageFinalizationHost,
  MessageFinalizationService,
  type MessageFinalizationSyncResult,
  shouldSyncAfterStream,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

type MockedMessageFinalizationHost = {
  [Key in keyof MessageFinalizationHost]:
    MessageFinalizationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageFinalizationHost[Key];
};

type CanonicalAwareMessageFinalizationHost = MockedMessageFinalizationHost & {
  syncConversationMessagesFromCanonicalState: jest.Mock<
    Promise<MessageFinalizationSyncResult | null>,
    [Conversation, string | null, string]
  >;
};

function createHost(
  conversation: Conversation,
  overrides: Partial<MockedMessageFinalizationHost> = {},
): MockedMessageFinalizationHost {
  return {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(null),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      messages: conversation.messages,
      changed: false,
      fingerprint: OpenCodeService.getCanonicalConversationFingerprint(conversation.messages),
    }),
    getConversationSyncFingerprint: jest.fn().mockImplementation(
      (messages: ChatMessage[]) => OpenCodeService.getCanonicalConversationFingerprint(messages),
    ),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    appendTurnDiffNoticeIfNeeded: jest.fn().mockResolvedValue(undefined),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    setConversationSyncInFlight: jest.fn(),
    setLastConversationSyncFingerprint: jest.fn(),
    clearPendingEditedFiles: jest.fn(),
    setTabNeedsAttention: jest.fn(),
    setActiveTabConversation: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message
        ? {
          id: message.id,
          role: message.role,
        }
        : null
    )),
    renderStreamError: jest.fn(),
    formatCurrentSessionModelId: jest.fn().mockReturnValue('test-model'),
    updateConversationSyncRuntime: jest.fn(),
    scrollToBottom: jest.fn(),
    ...overrides,
  };
}

describe('shouldSyncAfterStream', () => {
  it.each([
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: null }, true],
    [{ streamCompleted: false, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: true, streamInterrupted: false, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: true, latestErrorMessage: null }, false],
    [{ streamCompleted: true, streamTimedOut: false, streamInterrupted: false, latestErrorMessage: 'boom' }, false],
  ])('returns %s => %s', (options, expected) => {
    expect(shouldSyncAfterStream(options)).toBe(expected);
  });
});

describe('MessageFinalizationService foreground finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips server sync and render patching when final sync is not needed', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: false,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(host.appendTurnDiffNoticeIfNeeded).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.clearPendingEditedFiles).toHaveBeenCalledWith('tab-1');
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-1', false);
    expect(host.setActiveTabConversation).toHaveBeenCalledWith(conversation);
    expect(host.syncActiveTabContextUsageIdentity).toHaveBeenCalledTimes(1);
    expect(host.refreshActiveTabContextUsageFromServer).toHaveBeenCalledTimes(1);
    expect(host.setConversationSyncInFlight).not.toHaveBeenCalled();
    expect(logStage).not.toHaveBeenCalledWith('server-sync-requested', expect.anything());
  });

  it('avoids patching or rerendering when synced visual fingerprint is unchanged', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', content: 'Stable', timestamp: 10 }),
    ]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(conversation, 'tab-1', 'send-finalization');
    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(host.appendTurnDiffNoticeIfNeeded).toHaveBeenCalledWith(conversation, ['notes.md'], 'tab-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    const stableFingerprint = host.getConversationSyncFingerprint(conversation.messages);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(1, 'tab-1', stableFingerprint);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      2,
      'tab-1',
      stableFingerprint,
    );
    expect(host.setConversationSyncInFlight).toHaveBeenCalledWith('tab-1', false);
  });

  it('delegates synced render application when visuals changed', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Before', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'After', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'sync-fingerprint-2',
        };
      }),
    });
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
  });
});

describe('MessageFinalizationService canonical-first foreground finalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers canonical convergence before server sync for changed foreground text responses', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Before', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'After', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'sync-fingerprint-2',
        };
      }),
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(
      async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'canonical-fingerprint-2',
        };
      },
    );
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);
    const logStage = jest.fn();

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('post-sync-render-apply-complete');
  });

  it('prefers canonical convergence for tool-first assistant responses without reviving stale local body data', async () => {
    const previousMessages = [
      createMessage({
        id: 'assistant-local',
        content: 'stale local answer',
        timestamp: 10,
        sourceMessageId: 'assistant-1',
        structured: { stale: true },
        contentBlocks: [
          { type: 'tool_use', toolId: 'call-stale', toolName: 'structured_output' },
          { type: 'text', text: 'stale local answer' },
        ],
      }),
    ];
    const nextMessages = [
      createMessage({
        id: 'assistant-1',
        content: 'Canonical tool answer',
        timestamp: 11,
        sourceMessageId: 'assistant-1',
        contentBlocks: [
          { type: 'tool_use', toolId: 'call-read-1', toolName: 'read' },
          { type: 'text', text: 'Canonical tool answer' },
        ],
      }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn(),
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockImplementation(
      async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: OpenCodeService.getCanonicalConversationFingerprint(nextMessages),
        };
      },
    );
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).not.toHaveBeenCalled();
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
    expect(conversation.messages[0]).toMatchObject({
      id: 'assistant-1',
      content: 'Canonical tool answer',
      sourceMessageId: 'assistant-1',
      contentBlocks: expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_use',
          toolId: 'call-read-1',
          toolName: 'read',
        }),
      ]),
    });
    expect(conversation.messages[0]?.structured).toBeUndefined();
  });
});

describe('MessageFinalizationService background and recovery paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the tab for attention instead of foreground updates when user switched away', async () => {
    const sendingConversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const visibleConversation = createConversation([
      createMessage({ id: 'assistant-visible', timestamp: 20 }),
    ]);
    const host = createHost(sendingConversation, {
      getCurrentConversation: jest.fn().mockReturnValue(visibleConversation),
      getActiveTabId: jest.fn().mockReturnValue('tab-2'),
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAfterStream({
      conversation: sendingConversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.applySyncedConversationUpdate).not.toHaveBeenCalled();
    expect(host.setActiveTabConversation).not.toHaveBeenCalled();
    expect(host.syncActiveTabContextUsageIdentity).not.toHaveBeenCalled();
    expect(host.refreshActiveTabContextUsageFromServer).not.toHaveBeenCalled();
    expect(host.setTabNeedsAttention).toHaveBeenCalledWith('tab-1', true);
  });

  it('routes canonical-only sync drift through the centralized foreground render input', async () => {
    const previousMessages = [
      createMessage({
        id: 'user-1',
        role: 'user',
        content: 'Question',
        timestamp: 1,
        parts: [
          {
            id: 'part-user-visible',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
        ],
      }),
      createMessage({
        id: 'assistant-1',
        content: 'Stable answer',
        timestamp: 2,
      }),
    ];
    const nextMessages = [
      {
        ...previousMessages[0],
        parts: [
          {
            id: 'part-user-visible',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
          {
            id: 'part-user-plugin',
            sessionID: 'session-1',
            messageID: 'user-1',
            type: 'text',
            text: 'Injected plugin prompt',
            synthetic: true,
            metadata: {
              source: 'plugin',
              pluginName: 'opencode-plugin-x',
            },
          },
        ],
      },
      previousMessages[1],
    ];
    const conversation = createConversation(previousMessages);
    const nextFingerprint = OpenCodeService.getCanonicalConversationFingerprint(nextMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: nextFingerprint,
        };
      }),
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage: jest.fn(),
    });

    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(
      previousMessages,
      nextMessages,
    );
    expect(host.renderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalledWith('tab-1');
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      1,
      'tab-1',
      nextFingerprint,
    );
    expect(host.setLastConversationSyncFingerprint).toHaveBeenNthCalledWith(
      2,
      'tab-1',
      nextFingerprint,
    );
  });

  it('falls back to server sync only when canonical convergence is unavailable', async () => {
    const previousMessages = [
      createMessage({ id: 'assistant-local', content: 'Local only', timestamp: 10 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-server', content: 'Server fallback', timestamp: 11 }),
    ];
    const conversation = createConversation(previousMessages);
    const host = createHost(conversation, {
      syncConversationMessagesFromServer: jest.fn().mockImplementation(async (targetConversation: Conversation) => {
        targetConversation.messages = nextMessages;
        return {
          messages: nextMessages,
          changed: true,
          fingerprint: 'server-fingerprint-2',
        };
      }),
    }) as CanonicalAwareMessageFinalizationHost;
    host.syncConversationMessagesFromCanonicalState = jest.fn().mockResolvedValue(null);
    const service = new MessageFinalizationService(host as unknown as MessageFinalizationHost);

    await service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: [],
      logStage: jest.fn(),
    });

    expect(host.syncConversationMessagesFromCanonicalState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.syncConversationMessagesFromServer).toHaveBeenCalledWith(
      conversation,
      'tab-1',
      'send-finalization',
    );
    expect(host.applySyncedConversationUpdate).toHaveBeenCalledWith(previousMessages, nextMessages);
  });

  it('clears the sync lock even when final save fails', async () => {
    const conversation = createConversation([
      createMessage({ id: 'assistant-1', timestamp: 10 }),
    ]);
    const host = createHost(conversation, {
      saveConversation: jest.fn().mockRejectedValue(new Error('save failed')),
    });
    const service = new MessageFinalizationService(host);
    const logStage = jest.fn();

    await expect(service.finalizeAfterStream({
      conversation,
      tabId: 'tab-1',
      shouldSyncFromServer: true,
      editedFiles: ['notes.md'],
      logStage,
    })).rejects.toThrow('save failed');

    expect(host.setConversationSyncInFlight).toHaveBeenCalledWith('tab-1', false);
    expect(logStage).toHaveBeenCalledWith('conversation-sync-lock-cleared');
  });
});

describe('getFriendlyServerStartErrorMessage', () => {
  it('classifies opencode-not-found errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('opencode not found in PATH'));
    expect(result).toContain('opencode');
    expect(result).not.toContain('opencode not found in PATH');
  });

  it('classifies port-in-use errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('Port 4096 already in use'));
    expect(result).not.toContain('Port 4096 already in use');
  });

  it('returns generic message with raw error for unknown errors', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('something else went wrong'));
    expect(result).toContain('something else went wrong');
  });

  it('handles non-Error values', () => {
    const result = getFriendlyServerStartErrorMessage('plain string error');
    expect(result).toContain('plain string error');
  });

  it('matches opencode not found case-insensitively', () => {
    const result = getFriendlyServerStartErrorMessage(new Error('OpenCode Not Found'));
    expect(result).not.toContain('OpenCode Not Found');
    expect(result).toContain('opencode');
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders stream error and persists error message to conversation', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithError(
      messageEl,
      contentEl,
      'Server offline',
    );

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        messageEl,
        contentEl,
        content: 'Server offline',
        modelId: 'test-model',
      }),
    );
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].role).toBe('assistant');
    expect(conversation.messages[0].content).toBe('Server offline');
  });

  it('updates conversation sync runtime fingerprint after persisting', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'),
      document.createElement('div'),
      'Error',
    );

    expect(host.updateConversationSyncRuntime).toHaveBeenCalledWith(
      'tab-1',
      { fingerprint: expect.any(String) },
    );
  });

  it('scrolls to bottom after error finalization', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'),
      document.createElement('div'),
      'Error',
    );

    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('skips persistence when conversation is null', async () => {
    const host = createHost(createConversation([]), {
      getCurrentConversation: jest.fn().mockReturnValue(null),
    });
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithError(
      document.createElement('div'),
      document.createElement('div'),
      'Error',
    );

    expect(host.renderStreamError).toHaveBeenCalled();
    expect(host.saveConversation).not.toHaveBeenCalled();
    expect(host.updateConversationSyncRuntime).not.toHaveBeenCalled();
    expect(host.scrollToBottom).toHaveBeenCalled();
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithServerError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies server error and delegates to finalizeAssistantMessageWithError', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithServerError(
      messageEl,
      contentEl,
      new Error('opencode not found in PATH'),
    );

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        messageEl,
        contentEl,
        modelId: 'test-model',
      }),
    );
    expect(host.renderStreamError.mock.calls[0][0].content).not.toBe('opencode not found in PATH');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('classifies port-in-use errors through delegation', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithServerError(
      document.createElement('div'),
      document.createElement('div'),
      new Error('Port 4096 already in use'),
    );

    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toContain('Port 4096 already in use');
    expect(renderedContent.length).toBeGreaterThan(0);
  });
});

describe('getUnavailableServerMessage', () => {
  it('returns starting message for starting availability', () => {
    const result = getUnavailableServerMessage('starting');
    expect(result).not.toBe('starting');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns offline message for offline availability', () => {
    const result = getUnavailableServerMessage('offline');
    expect(result).not.toBe('offline');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns offline message for checking availability', () => {
    const result = getUnavailableServerMessage('checking');
    expect(result).not.toBe('checking');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('MessageFinalizationService.finalizeAssistantMessageWithServerUnavailableError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies offline availability and delegates to error finalization', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);
    const messageEl = document.createElement('div');
    const contentEl = document.createElement('div');

    await service.finalizeAssistantMessageWithServerUnavailableError(
      messageEl,
      contentEl,
      'offline',
    );

    expect(host.renderStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        messageEl,
        contentEl,
        modelId: 'test-model',
      }),
    );
    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toBe('offline');
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.scrollToBottom).toHaveBeenCalledWith({ enableAutoScroll: true });
  });

  it('classifies starting availability through delegation', async () => {
    const conversation = createConversation([]);
    const host = createHost(conversation);
    const service = new MessageFinalizationService(host);

    await service.finalizeAssistantMessageWithServerUnavailableError(
      document.createElement('div'),
      document.createElement('div'),
      'starting',
    );

    const renderedContent = host.renderStreamError.mock.calls[0][0].content;
    expect(renderedContent).not.toBe('starting');
    expect(renderedContent.length).toBeGreaterThan(0);
  });
});
