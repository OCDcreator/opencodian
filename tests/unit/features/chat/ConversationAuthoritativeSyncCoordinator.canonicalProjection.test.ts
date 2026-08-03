/* eslint-disable max-lines -- Canonical projection regression scenarios stay grouped by sync owner. */

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

function createTurnDiffRaceMessages(sessionId: string): CanonicalSessionMessage[] {
  return [
    {
      info: {
        id: 'user-race',
        role: 'user',
        sessionID: sessionId,
        time: { created: 10 },
      },
      parts: [{
        id: 'part-user-race',
        sessionID: sessionId,
        messageID: 'user-race',
        type: 'text',
        text: 'Edit notes',
      }],
    },
    {
      info: {
        id: 'assistant-race',
        role: 'assistant',
        sessionID: sessionId,
        time: { created: 20 },
      },
      parts: [{
        id: 'part-assistant-race',
        sessionID: sessionId,
        messageID: 'assistant-race',
        type: 'text',
        text: 'Done',
      }],
    },
  ];
}

function createTurnDiffRaceNotice(): ChatMessage {
  return {
    id: 'turn-diff-race-notice',
    role: 'assistant',
    content: 'changed notes.md',
    timestamp: 30,
    displayStyle: 'notice',
    noticeMeta: {
      kind: 'turn-diff',
      sourceMessageId: 'user-race',
      entries: [{ file: 'notes.md', additions: 2, deletions: 1 }],
    },
  };
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

  it('preserves one anchored local turn diff notice across authoritative sync', async () => {
    const serverMessages: CanonicalSessionMessage[] = [
      {
        info: {
          id: 'user-1',
          role: 'user',
          sessionID: 'session-turn-diff',
          time: { created: 10 },
        },
        parts: [{
          id: 'part-user-1',
          sessionID: 'session-turn-diff',
          messageID: 'user-1',
          type: 'text',
          text: 'edit notes',
        }],
      },
      {
        info: {
          id: 'assistant-1',
          role: 'assistant',
          sessionID: 'session-turn-diff',
          time: { created: 20 },
        },
        parts: [{
          id: 'part-assistant-1',
          sessionID: 'session-turn-diff',
          messageID: 'assistant-1',
          type: 'text',
          text: 'done',
        }],
      },
    ];
    const turnDiffNotice: ChatMessage = {
      id: 'turn-diff-notice',
      role: 'assistant',
      content: 'changed notes.md',
      timestamp: 30,
      displayStyle: 'notice',
      noticeMeta: {
        kind: 'turn-diff',
        sourceMessageId: 'user-1',
        entries: [{ file: 'notes.md', additions: 2, deletions: 1 }],
      },
    };
    const conversation = createConversation('turn-diff-sync', {
      messages: [
        turnDiffNotice,
        {
          id: 'generic-local-notice',
          role: 'assistant',
          content: 'local-only generic notice',
          timestamp: 31,
          displayStyle: 'notice',
          noticeTone: 'info',
        },
      ],
    });
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue(serverMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromServer(conversation, 'tab-1');

    expect(result.messages.filter((message) => message.id === 'turn-diff-notice')).toHaveLength(1);
    expect(result.messages.some((message) => message.id === 'generic-local-notice')).toBe(false);
    expect(result.messages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
      'turn-diff-notice',
    ]);
  });

  it('preserves a turn diff notice appended after server merge but before serialized commit', async () => {
    const conversation = createConversation('turn-diff-server-race');
    const serverMessages = createTurnDiffRaceMessages(conversation.openCodeSessionId);
    const turnDiffNotice = createTurnDiffRaceNotice();
    const host = createHost({
      getSessionMessages: jest.fn().mockResolvedValue(serverMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
      commitConversationWrite: jest.fn().mockImplementation(async (
        _conversation: Conversation,
        _ticket,
        _reason,
        write,
      ) => {
        conversation.messages.push(turnDiffNotice);
        await write();
        return true;
      }),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromServer(
      conversation,
      'tab-1',
      'visible-background-sync',
    );

    expect(result.messages.filter((message) => message.id === turnDiffNotice.id)).toHaveLength(1);
    expect(conversation.messages.filter((message) => message.id === turnDiffNotice.id)).toHaveLength(1);
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

  it('saves canonical cache writeback even when foreground render fingerprint is unchanged', async () => {
    const canonicalMessages: CanonicalSessionMessage[] = [
      {
        info: {
          id: 'user-1',
          role: 'user',
          sessionID: 'session-sync-cache-writeback',
          time: { created: 10 },
        },
        parts: [
          {
            id: 'part-user-1',
            sessionID: 'session-sync-cache-writeback',
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
          sessionID: 'session-sync-cache-writeback',
          time: { created: 20 },
        },
        parts: [
          {
            id: 'part-assistant-1',
            sessionID: 'session-sync-cache-writeback',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Canonical cache answer',
          },
        ],
      },
    ];
    const conversation = createConversation('sync-cache-writeback', {
      messages: [
        {
          id: 'assistant-local',
          role: 'assistant',
          content: 'stale cache answer',
          timestamp: 1,
          sourceMessageId: 'assistant-1',
          structured: { stale: true },
          contentBlocks: [
            { type: 'text', text: 'stale cache answer' },
          ],
        } as ChatMessage,
      ],
    });
    const expectedMessages = buildCanonicalRenderMessages(
      conversation.openCodeSessionId,
      canonicalMessages,
    );
    const host = createHost({
      getTabRuntimeState: jest.fn().mockReturnValue({
        lastConversationSyncFingerprint: JSON.stringify(expectedMessages.map((message) => ({
          id: message.id,
          sourceMessageId: message.sourceMessageId ?? null,
          streamState: message.streamState ?? null,
          displayStyle: message.displayStyle ?? null,
          content: message.content,
          timestamp: message.timestamp,
        }))),
        lastInterruptedSyncPreservationLogFingerprint: null,
      }),
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

    expect(result?.changed).toBe(false);
    expect(result?.messages).toEqual(expectedMessages);
    expect(conversation.messages).toEqual(expectedMessages);
    expect(host.saveConversation).toHaveBeenCalledTimes(1);
    expect(host.saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('preserves a turn diff notice appended after canonical merge but before serialized commit', async () => {
    const conversation = createConversation('turn-diff-canonical-race');
    const canonicalMessages = createTurnDiffRaceMessages(conversation.openCodeSessionId);
    const turnDiffNotice = createTurnDiffRaceNotice();
    const host = createHost({
      getCanonicalSessionMessages: jest.fn().mockReturnValue(canonicalMessages),
      hydrateOpenCodeMessage: jest.fn((info, parts) =>
        OpenCodeService.openCodeMessageToChatMessage(info as never, parts as never)),
      commitConversationWrite: jest.fn().mockImplementation(async (
        _conversation: Conversation,
        _ticket,
        _reason,
        write,
      ) => {
        conversation.messages.push(turnDiffNotice);
        await write();
        return true;
      }),
    });
    const coordinator = new ConversationAuthoritativeSyncCoordinator(host);

    const result = await coordinator.syncConversationMessagesFromCanonicalState(
      conversation,
      'tab-1',
      'sync-event:message.updated',
    );

    expect(result?.messages.filter((message) => message.id === turnDiffNotice.id)).toHaveLength(1);
    expect(conversation.messages.filter((message) => message.id === turnDiffNotice.id)).toHaveLength(1);
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
