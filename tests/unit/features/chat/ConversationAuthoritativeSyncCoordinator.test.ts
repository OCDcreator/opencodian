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
  const host: Mocked<ConversationAuthoritativeSyncHost> = {
    getVaultBasePath: jest.fn().mockReturnValue(undefined),
    getTabRuntimeState: jest.fn().mockReturnValue(null),
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
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      conversation: Conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      await host.saveConversation(conversation);
      return true;
    }),
    logOmoBackgroundTaskDiagnostics: jest.fn(),
    markBackgroundTaskAuthoritativeSync: jest.fn(),
    refreshContextUsageAfterActiveConversationSync: jest.fn().mockResolvedValue(undefined),
    armBackgroundTaskIndicatorForUserMessage: jest.fn(),
    updateHydratedUserMessageRuntimeAnchors: jest.fn(),
    rerenderSingleUserMessage: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) =>
      message
        ? {
          id: message.id,
          role: message.role,
          sourceMessageId: message.sourceMessageId ?? null,
        }
        : null,
    ),
    logAssistantFinalizationDebug: jest.fn(),
    stringifyLogPayload: jest.fn().mockImplementation((payload: unknown) => JSON.stringify(payload)),
    getLogPreview: jest.fn().mockImplementation((text: string) => text),
    ...overrides,
  };
  return host;
}

describe('ConversationAuthoritativeSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not preserve richer local assistant content blocks over canonical synced content', () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const merged = coordinator.mergeClientOnlyMessageFields(
      {
        id: 'assistant-local',
        role: 'assistant',
        content: 'answer',
        timestamp: 1,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
          { type: 'text', text: 'answer' },
        ],
      } as ChatMessage,
      {
        id: 'assistant-server',
        role: 'assistant',
        content: 'answer',
        timestamp: 2,
        sourceMessageId: 'msg-1',
        contentBlocks: [
          { type: 'text', text: 'answer' },
        ],
      } as ChatMessage,
    );

    expect(merged).toMatchObject({
      id: 'assistant-server',
      sourceMessageId: 'msg-1',
      content: 'answer',
      contentBlocks: [
        { type: 'text', text: 'answer' },
      ],
    });
    expect(host.logAssistantFinalizationDebug).not.toHaveBeenCalled();
  });

  it('preserves interrupted local assistant messages across authoritative sync merges', async () => {
    const runtime = createRuntime();
    const host = createHost({
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-preserve', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'Partial interrupted reply',
          timestamp: 1000,
          streamState: 'interrupted',
          contentBlocks: [
            {
              type: 'text',
              text: 'Partial interrupted reply',
            },
          ],
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'background-tab-sync',
    );

    expect(result).toMatchObject({
      changed: false,
      messages: [
        expect.objectContaining({
          id: 'assistant-local',
          streamState: 'interrupted',
          content: 'Partial interrupted reply',
        }),
      ],
    });
    expect(host.markBackgroundTaskAuthoritativeSync).toHaveBeenCalledWith(
      'tab-1',
      'background-tab-sync',
    );
    expect(runtime.lastInterruptedSyncPreservationLogFingerprint).not.toBeNull();
  });

  it('preserves a locally failed send turn when authoritative sync is empty', async () => {
    const host = createHost();
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-preserve-local-error', {
      messages: [
        {
          id: 'user-local',
          role: 'user',
          content: '你好',
          timestamp: 1000,
        } as ChatMessage,
        {
          id: 'assistant-error-notice-1001',
          role: 'assistant',
          content: '发送消息失败\nRequest failed, status 400',
          timestamp: 1001,
          modelId: 'opencode/minimax-m2.5-free',
          displayStyle: 'notice',
          noticeTitle: '本次回复没有成功返回',
          noticeTone: 'error',
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'visible-background-sync',
    );

    expect(result).toMatchObject({
      changed: false,
      messages: [
        expect.objectContaining({
          id: 'user-local',
          role: 'user',
          content: '你好',
        }),
        expect.objectContaining({
          id: 'assistant-error-notice-1001',
          displayStyle: 'notice',
          noticeTone: 'error',
        }),
      ],
    });
    expect(conversation.messages).toHaveLength(2);
    expect(result.messages[1]).not.toHaveProperty('sourceMessageId');
  });

  it('does not preserve local interrupted assistant messages when canonical synced messages exist', async () => {
    const runtime = createRuntime();
    const syncedUserMessage: ChatMessage = {
      id: 'user-synced',
      role: 'user',
      content: 'Server question',
      timestamp: 10,
      sourceMessageId: 'user-synced',
    };
    const host = createHost({
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'user-synced',
            role: 'user',
            sessionID: 'session-sync-no-preserve',
            time: { created: 10 },
          },
          parts: [
            {
              id: 'part-user-synced',
              sessionID: 'session-sync-no-preserve',
              messageID: 'user-synced',
              type: 'text',
              text: 'Server question',
            },
          ],
        },
      ]),
      hydrateOpenCodeMessage: jest.fn().mockReturnValue(syncedUserMessage),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-no-preserve', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'Partial interrupted reply',
          timestamp: 1000,
          streamState: 'interrupted',
          contentBlocks: [
            {
              type: 'text',
              text: 'Partial interrupted reply',
            },
          ],
        } as ChatMessage,
      ],
    });

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'background-tab-sync',
    );

    expect(result.messages).toEqual([syncedUserMessage]);
    expect(runtime.lastInterruptedSyncPreservationLogFingerprint).toBeNull();
  });
});

describe('ConversationAuthoritativeSyncCoordinator serialized hydration writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips hydrated optimistic user side effects when the serialized commit is stale', async () => {
    const optimisticMessage: ChatMessage = {
      id: 'optimistic-user',
      role: 'user',
      content: 'Server question',
      timestamp: 1,
    };
    const syncedUserMessage: ChatMessage = {
      id: 'server-user',
      role: 'user',
      content: 'Server question',
      timestamp: 2,
      sourceMessageId: 'server-user',
    };
    const host = createHost({
      getCurrentConversationId: jest.fn().mockReturnValue('sync-hydrate'),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getSessionMessages: jest.fn().mockResolvedValue([
        {
          info: {
            id: 'server-user',
            role: 'user',
            sessionID: 'session-sync-hydrate',
            time: { created: 2 },
          },
          parts: [
            {
              id: 'part-server-user',
              sessionID: 'session-sync-hydrate',
              messageID: 'server-user',
              type: 'text',
              text: 'Server question',
            },
          ],
        },
      ]),
      hydrateOpenCodeMessage: jest.fn().mockReturnValue(syncedUserMessage),
      commitConversationWrite: jest.fn().mockResolvedValue(false),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);
    const conversation = createConversation('sync-hydrate', {
      messages: [optimisticMessage],
    });

    await coordinator.syncLatestUserMessageFromServer(
      conversation,
      optimisticMessage.id,
      'tab-1',
    );

    expect(conversation.messages).toEqual([optimisticMessage]);
    expect(host.commitConversationWrite).toHaveBeenCalledWith(
      conversation,
      expect.objectContaining({ conversationId: conversation.id }),
      'latest-user-hydration',
      expect.any(Function),
    );
    expect(host.armBackgroundTaskIndicatorForUserMessage).not.toHaveBeenCalled();
    expect(host.rerenderSingleUserMessage).not.toHaveBeenCalled();
  });
});
