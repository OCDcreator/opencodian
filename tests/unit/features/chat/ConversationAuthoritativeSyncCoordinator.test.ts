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
