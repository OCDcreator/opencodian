import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
  type ConversationAuthoritativeSyncRuntime,
} from '../../../../src/features/chat/services/ConversationAuthoritativeSyncCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createConversation(
  id: string,
  overrides?: Partial<Conversation>,
): Conversation {
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

function createRuntime(
  overrides?: Partial<ConversationAuthoritativeSyncRuntime>,
): ConversationAuthoritativeSyncRuntime {
  return {
    lastConversationSyncFingerprint: null,
    lastInterruptedSyncPreservationLogFingerprint: null,
    ...overrides,
  };
}

function createHost(
  overrides?: Partial<Mocked<ConversationAuthoritativeSyncHost>>,
): Mocked<ConversationAuthoritativeSyncHost> {
  return {
    getVaultBasePath: jest.fn().mockReturnValue(undefined),
    getTabRuntimeState: jest.fn().mockReturnValue(createRuntime()),
    getCurrentConversationId: jest.fn().mockReturnValue(null),
    getCurrentConversationRevertState: jest.fn().mockReturnValue(null),
    getActiveTabId: jest.fn().mockReturnValue(null),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    getCanonicalSessionMessages: jest.fn().mockReturnValue([]),
    getSessionRevertState: jest.fn().mockResolvedValue(null),
    hydrateOpenCodeMessage: jest.fn(),
    shouldRenderConversationMessage: jest.fn().mockReturnValue(true),
    getConversationSyncFingerprint: jest.fn().mockImplementation((messages: ChatMessage[]) =>
      JSON.stringify(messages.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId ?? null,
        streamState: message.streamState ?? null,
        displayStyle: message.displayStyle ?? null,
        content: message.content,
        timestamp: message.timestamp,
      }))),
    ),
    getInterruptedSyncPreservationLogFingerprint: jest.fn().mockImplementation(
      (conversation: Conversation, messages: ChatMessage[]) =>
        JSON.stringify({
          conversationId: conversation.id,
          messages: messages.map((message) => message.id),
        }),
    ),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    logOmoBackgroundTaskDiagnostics: jest.fn(),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    refreshContextUsageAfterActiveConversationSync: jest.fn().mockResolvedValue(undefined),
    armBackgroundTaskIndicatorForUserMessage: jest.fn(),
    updateHydratedUserMessageRuntimeAnchors: jest.fn(),
    rerenderSingleUserMessage: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
      message
        ? { id: message.id, role: message.role, sourceMessageId: message.sourceMessageId ?? null }
        : null),
    logAssistantFinalizationDebug: jest.fn(),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
    ...overrides,
  };
}

describe('ConversationAuthoritativeSyncCoordinator timeout notice canonical fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back from canonical sync when a timeout notice exists but canonical state still lacks the latest assistant', async () => {
    const latestUser: ChatMessage = {
      id: 'user-local-latest',
      role: 'user',
      content: '你好？',
      timestamp: 2000,
      sourceMessageId: 'msg-user-latest',
    };
    const host = createHost({
      getCanonicalSessionMessages: jest.fn().mockReturnValue([
        {
          info: {
            id: 'msg-user-old',
            role: 'user',
            sessionID: 'session-sync-canonical-timeout',
            time: { created: 1000 },
          },
          parts: [],
        },
        {
          info: {
            id: 'msg-assistant-old',
            role: 'assistant',
            sessionID: 'session-sync-canonical-timeout',
            parentID: 'msg-user-old',
            time: { created: 1100 },
          },
          parts: [],
        },
        {
          info: {
            id: 'msg-user-latest',
            role: 'user',
            sessionID: 'session-sync-canonical-timeout',
            time: { created: 2000 },
          },
          parts: [],
        },
      ]),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-canonical-timeout', {
      messages: [
        {
          id: 'user-local-old',
          role: 'user',
          content: '旧问题',
          timestamp: 1000,
          sourceMessageId: 'msg-user-old',
        } as ChatMessage,
        {
          id: 'assistant-local-old',
          role: 'assistant',
          content: '旧回复',
          timestamp: 1100,
          sourceMessageId: 'msg-assistant-old',
        } as ChatMessage,
        latestUser,
        {
          id: 'assistant-interrupted-2001',
          role: 'assistant',
          content: '本次生成在输出可见回复前已被停止。',
          timestamp: 2001,
          displayStyle: 'notice',
          noticeTone: 'warning',
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      'tab-1',
      'visible-background-sync',
    );

    expect(result).toBeNull();
    expect(host.markBackgroundTaskAuthoritativeSync).not.toHaveBeenCalled();
  });
});

describe('ConversationAuthoritativeSyncCoordinator timeout notice server sync merge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves a timeout interrupted notice while synced messages still end at the latest user turn', async () => {
    const latestUser: ChatMessage = {
      id: 'user-local-latest',
      role: 'user',
      content: '你好？',
      timestamp: 2000,
      sourceMessageId: 'msg-user-latest',
    };
    const latestUserSynced: ChatMessage = {
      id: 'user-synced-latest',
      role: 'user',
      content: '你好？',
      timestamp: 2000,
      sourceMessageId: 'msg-user-latest',
    };
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'msg-user-old',
            role: 'user',
            sessionID: 'session-sync-preserve-timeout-notice',
            time: { created: 1000 },
          },
          parts: [],
        },
        {
          info: {
            id: 'msg-assistant-old',
            role: 'assistant',
            sessionID: 'session-sync-preserve-timeout-notice',
            parentID: 'msg-user-old',
            time: { created: 1100 },
          },
          parts: [],
        },
        {
          info: {
            id: 'msg-user-latest',
            role: 'user',
            sessionID: 'session-sync-preserve-timeout-notice',
            time: { created: 2000 },
          },
          parts: [],
        },
      ]),
      hydrateOpenCodeMessage: jest.fn()
        .mockReturnValueOnce({
          id: 'user-synced-old',
          role: 'user',
          content: '旧问题',
          timestamp: 1000,
          sourceMessageId: 'msg-user-old',
        } as ChatMessage)
        .mockReturnValueOnce({
          id: 'assistant-synced-old',
          role: 'assistant',
          content: '旧回复',
          timestamp: 1100,
          sourceMessageId: 'msg-assistant-old',
        } as ChatMessage)
        .mockReturnValueOnce(latestUserSynced),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-preserve-timeout-notice', {
      messages: [
        {
          id: 'user-local-old',
          role: 'user',
          content: '旧问题',
          timestamp: 1000,
          sourceMessageId: 'msg-user-old',
        } as ChatMessage,
        {
          id: 'assistant-local-old',
          role: 'assistant',
          content: '旧回复',
          timestamp: 1100,
          sourceMessageId: 'msg-assistant-old',
        } as ChatMessage,
        latestUser,
        {
          id: 'assistant-interrupted-2001',
          role: 'assistant',
          content: '本次生成在输出可见回复前已被停止。',
          timestamp: 2001,
          displayStyle: 'notice',
          noticeTone: 'warning',
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'visible-background-sync',
    );

    expect(result.messages).toEqual([
      expect.objectContaining({ sourceMessageId: 'msg-user-old' }),
      expect.objectContaining({ sourceMessageId: 'msg-assistant-old' }),
      latestUserSynced,
      expect.objectContaining({
        id: 'assistant-interrupted-2001',
        displayStyle: 'notice',
        noticeTone: 'warning',
      }),
    ]);
  });

  it('drops a timeout interrupted notice once authoritative sync includes the awaited assistant reply', async () => {
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'msg-user-latest',
            role: 'user',
            sessionID: 'session-sync-drop-timeout-notice',
            time: { created: 2000 },
          },
          parts: [],
        },
        {
          info: {
            id: 'msg-assistant-latest',
            role: 'assistant',
            sessionID: 'session-sync-drop-timeout-notice',
            parentID: 'msg-user-latest',
            time: { created: 2100 },
          },
          parts: [],
        },
      ]),
      hydrateOpenCodeMessage: jest.fn()
        .mockReturnValueOnce({
          id: 'user-synced-latest',
          role: 'user',
          content: '你好？',
          timestamp: 2000,
          sourceMessageId: 'msg-user-latest',
        } as ChatMessage)
        .mockReturnValueOnce({
          id: 'assistant-synced-latest',
          role: 'assistant',
          content: '终于回来了',
          timestamp: 2100,
          sourceMessageId: 'msg-assistant-latest',
        } as ChatMessage),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-drop-timeout-notice', {
      messages: [
        {
          id: 'user-local-latest',
          role: 'user',
          content: '你好？',
          timestamp: 2000,
          sourceMessageId: 'msg-user-latest',
        } as ChatMessage,
        {
          id: 'assistant-interrupted-2001',
          role: 'assistant',
          content: '本次生成在输出可见回复前已被停止。',
          timestamp: 2001,
          displayStyle: 'notice',
          noticeTone: 'warning',
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'visible-background-sync',
    );

    expect(result.messages).toEqual([
      expect.objectContaining({ sourceMessageId: 'msg-user-latest' }),
      expect.objectContaining({
        sourceMessageId: 'msg-assistant-latest',
        content: '终于回来了',
      }),
    ]);
  });
});
