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

  it('preserves richer local assistant content blocks when synced text matches', () => {
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
        { type: 'tool_use', toolId: 'tool-1', toolName: 'structured_output' },
        { type: 'text', text: 'answer' },
      ],
    });
    expect(host.logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'merge-client-only-message-fields',
      expect.objectContaining({
        preservedFlags: expect.objectContaining({
          preservedExistingContentBlocks: true,
        }),
      }),
    );
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
});
