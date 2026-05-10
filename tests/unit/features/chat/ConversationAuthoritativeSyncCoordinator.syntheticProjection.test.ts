import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationAuthoritativeSyncCoordinator,
  type ConversationAuthoritativeSyncHost,
} from '../../../../src/features/chat/services/ConversationAuthoritativeSyncCoordinator';
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
    getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint'),
    getInterruptedSyncPreservationLogFingerprint: jest.fn().mockReturnValue('interrupted-fingerprint'),
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

describe('ConversationAuthoritativeSyncCoordinator synthetic projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reloads plugin synthetic user parts from canonical state instead of local visible content', async () => {
    const canonicalMessages: CanonicalSessionMessage[] = [{
      info: {
        id: 'user-1',
        role: 'user',
        sessionID: 'session-sync-synthetic-parts',
        time: { created: 10 },
      },
      parts: [
        {
          id: 'part-visible',
          sessionID: 'session-sync-synthetic-parts',
          messageID: 'user-1',
          type: 'text',
          text: 'Question',
        },
        {
          id: 'part-plugin',
          sessionID: 'session-sync-synthetic-parts',
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
    }];
    const conversation = createConversation('sync-synthetic-parts', {
      messages: [{
        id: 'user-local',
        role: 'user',
        content: 'Question',
        timestamp: 1,
        sourceMessageId: 'user-1',
        parts: [{
          id: 'part-visible',
          sessionID: 'session-sync-synthetic-parts',
          messageID: 'user-1',
          type: 'text',
          text: 'Question',
        }],
      } as ChatMessage],
    });
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

    expect(result?.messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      sourceMessageId: 'user-1',
    });
    expect(result?.messages[0]?.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'part-plugin',
        synthetic: true,
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      }),
    ]));
    expect(conversation.messages[0]?.parts).toEqual(result?.messages[0]?.parts);
  });
});
