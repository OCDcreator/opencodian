import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from '../../../../src/features/chat/services/ConversationAuthoritativeSyncCoordinator';
import { ConversationTurnViewModelBuilder } from '../../../../src/features/chat/services/ConversationTurnViewModelBuilder';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

type CanonicalSessionMessage = NonNullable<
  ReturnType<ConversationAuthoritativeSyncHost['getCanonicalSessionMessages']>
>[number];

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

function buildCanonicalRenderMessages(
  sessionId: string,
  messages: CanonicalSessionMessage[],
): ChatMessage[] {
  const sessionState = {
    sessionID: sessionId,
    messages: messages.map(({ info }) => info),
    partsByMessageID: Object.fromEntries(
      messages.map(({ info, parts }) => [info.id, parts]),
    ),
  };

  return new ConversationTurnViewModelBuilder()
    .buildCanonicalRenderInput(sessionState, (info, parts) =>
      OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never))
    .messages;
}

describe('ConversationAuthoritativeSyncCoordinator server snapshot projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not preserve stale local context attachments when server snapshot no longer contains them', async () => {
    const serverMessages: CanonicalSessionMessage[] = [
      {
        info: {
          id: 'assistant-1',
          role: 'assistant',
          sessionID: 'session-sync-server-snapshot',
          time: { created: 20 },
        },
        parts: [
          {
            id: 'part-assistant-1',
            sessionID: 'session-sync-server-snapshot',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Canonical answer',
          },
        ],
      },
    ];
    const conversation = createConversation('sync-server-snapshot', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'stale local answer',
          timestamp: 1,
          sourceMessageId: 'assistant-1',
          contextAttachments: [
            {
              kind: 'file',
              path: 'docs/stale.md',
              label: 'Stale attachment',
              mime: 'text/markdown',
              textSnapshot: 'stale attachment text',
            },
          ],
          questionResolution: {
            request: {
              id: 'question-1',
              sessionId: 'session-sync-server-snapshot',
              questions: [
                {
                  question: 'Keep going?',
                  header: 'Question',
                  options: [
                    { label: 'Yes', description: 'Continue' },
                  ],
                },
              ],
            },
            status: 'answered',
            answers: [['Yes']],
          },
          structured: { stale: true },
          contentBlocks: [
            { type: 'text', text: 'stale local answer' },
          ],
        } as ChatMessage,
      ],
    });
    const expectedMessages = buildCanonicalRenderMessages(
      conversation.openCodeSessionId,
      serverMessages,
    );
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue(serverMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'background-tab-sync',
    );

    expect(result.messages).toHaveLength(expectedMessages.length);
    expect(result.messages[0]).toMatchObject({
      id: 'assistant-1',
      content: 'Canonical answer',
      sourceMessageId: 'assistant-1',
      questionResolution: conversation.messages[0]?.questionResolution,
    });
    expect(result.messages[0]?.contextAttachments).toBeUndefined();
    expect(result.messages[0]?.structured).toBeUndefined();
  });
});

describe('ConversationAuthoritativeSyncCoordinator canonical projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('projects canonical normal assistant sync output without allowing stale local assistant body to win', async () => {
    const canonicalMessages: CanonicalSessionMessage[] = [
      {
        info: {
          id: 'user-1',
          role: 'user',
          sessionID: 'session-sync-normal',
          time: { created: 10 },
        },
        parts: [
          {
            id: 'part-user-1',
            sessionID: 'session-sync-normal',
            messageID: 'user-1',
            type: 'text',
            text: 'Question',
          },
        ],
      },
      {
        info: {
          id: 'assistant-1',
          role: 'assistant',
          sessionID: 'session-sync-normal',
          time: { created: 20 },
        },
        parts: [
          {
            id: 'part-assistant-1',
            sessionID: 'session-sync-normal',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Canonical answer',
          },
        ],
      },
    ];
    const conversation = createConversation('sync-normal', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'stale local answer',
          timestamp: 1,
          sourceMessageId: 'assistant-1',
          structured: { stale: true },
          contentBlocks: [
            { type: 'text', text: 'stale local answer' },
          ],
        } as ChatMessage,
      ],
    });
    const expectedMessages = buildCanonicalRenderMessages(
      conversation.openCodeSessionId,
      canonicalMessages,
    );
    const host = createHost({
      getCanonicalSessionMessages: jest.fn().mockReturnValue(canonicalMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      'tab-1',
      'sync-event:message.updated',
    );

    expect(result?.messages).toEqual(expectedMessages);
    expect(conversation.messages).toEqual(expectedMessages);
    expect(result?.messages[1]).toMatchObject({
      id: 'assistant-1',
      content: 'Canonical answer',
      sourceMessageId: 'assistant-1',
    });
    expect(result?.messages[1]?.structured).toBeUndefined();
  });
});

describe('ConversationAuthoritativeSyncCoordinator canonical tool projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('projects canonical tool-first assistant sync output without reviving stale local tool or structured data', async () => {
    const canonicalMessages: CanonicalSessionMessage[] = [
      {
        info: {
          id: 'user-1',
          role: 'user',
          sessionID: 'session-sync-tool-first',
          time: { created: 10 },
        },
        parts: [
          {
            id: 'part-user-1',
            sessionID: 'session-sync-tool-first',
            messageID: 'user-1',
            type: 'text',
            text: 'Inspect docs',
          },
        ],
      },
      {
        info: {
          id: 'assistant-1',
          role: 'assistant',
          sessionID: 'session-sync-tool-first',
          time: { created: 20 },
        },
        parts: [
          {
            id: 'part-tool-1',
            sessionID: 'session-sync-tool-first',
            messageID: 'assistant-1',
            type: 'tool',
            tool: 'read',
            callID: 'call-read-1',
            state: {
              status: 'completed',
              input: { filePath: 'docs/architecture/README.md' },
              output: 'done',
            },
          },
          {
            id: 'part-text-1',
            sessionID: 'session-sync-tool-first',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Canonical tool answer',
          },
        ],
      },
    ];
    const conversation = createConversation('sync-tool-first', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'stale local answer',
          timestamp: 1,
          sourceMessageId: 'assistant-1',
          structured: { stale: true },
          toolCalls: [
            {
              id: 'call-stale',
              name: 'structured_output',
              input: {},
              status: 'completed',
            },
          ],
          contentBlocks: [
            { type: 'tool_use', toolId: 'call-stale', toolName: 'structured_output' },
            { type: 'text', text: 'stale local answer' },
          ],
        } as ChatMessage,
      ],
    });
    const expectedMessages = buildCanonicalRenderMessages(
      conversation.openCodeSessionId,
      canonicalMessages,
    );
    const host = createHost({
      getCanonicalSessionMessages: jest.fn().mockReturnValue(canonicalMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      'tab-1',
      'sync-event:message.part.updated',
    );

    expect(result?.messages).toEqual(expectedMessages);
    expect(conversation.messages).toEqual(expectedMessages);
    expect(result?.messages[1]).toMatchObject({
      id: 'assistant-1',
      content: 'Canonical tool answer',
      sourceMessageId: 'assistant-1',
      contentBlocks: expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_use',
          toolId: 'call-read-1',
          toolName: 'read',
        }),
        expect.objectContaining({
          type: 'text',
          text: 'Canonical tool answer',
        }),
      ]),
    });
    expect(result?.messages[1]?.contentBlocks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_use',
          toolId: 'call-stale',
        }),
      ]),
    );
    expect(result?.messages[1]?.structured).toBeUndefined();
  });
});
