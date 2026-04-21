import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
  OpenCodeCanonicalSessionState,
} from '../../../../src/core/opencode';
import {
  ConversationRenderService,
  createConversation,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

function createCanonicalMessage(
  overrides: Partial<OpenCodeCanonicalMessageInfo> & {
    id: string;
    role: OpenCodeCanonicalMessageInfo['role'];
  },
): OpenCodeCanonicalMessageInfo {
  return {
    sessionID: 'session-1',
    time: { created: 1 },
    ...overrides,
  };
}

function createCanonicalPart(
  overrides: Partial<OpenCodeCanonicalPart> & {
    id: string;
    messageID: string;
    type: string;
  },
): OpenCodeCanonicalPart {
  return {
    sessionID: 'session-1',
    ...overrides,
  };
}

function hydrateCanonicalMessage(
  info: OpenCodeCanonicalMessageInfo,
  parts: OpenCodeCanonicalPart[],
) {
  return createMessage({
    id: info.id,
    role: info.role,
    content: parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join(''),
    timestamp: info.time.created,
    sourceMessageId: info.id,
    parts,
  });
}

describe('ConversationRenderService canonical order regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a parent-linked assistant under the original user turn when canonical message order is corrupted', async () => {
    const conversation = createConversation([
      createMessage({ id: 'stale-user-1', role: 'user', content: 'stale hello' }),
      createMessage({ id: 'stale-assistant-1', content: 'stale reply' }),
      createMessage({ id: 'stale-user-2', role: 'user', content: 'stale second' }),
    ]);
    const canonicalState: OpenCodeCanonicalSessionState = {
      sessionID: 'session-1',
      messages: [
        createCanonicalMessage({ id: 'msg_947188ec-random-user-3', role: 'user', time: { created: 4 } }),
        createCanonicalMessage({ id: 'msg_c460fc93-random-user-1', role: 'user', time: { created: 1 } }),
        createCanonicalMessage({ id: 'msg_d4d34935-random-user-2', role: 'user', time: { created: 3 } }),
        createCanonicalMessage({
          id: 'msg_db035fb4-monotonic-assistant',
          role: 'assistant',
          time: { created: 2 },
          parentID: 'msg_c460fc93-random-user-1',
        } as OpenCodeCanonicalMessageInfo),
      ],
      partsByMessageID: {
        'msg_c460fc93-random-user-1': [
          createCanonicalPart({
            id: 'part-user-1',
            messageID: 'msg_c460fc93-random-user-1',
            type: 'text',
            text: '你好',
          }),
        ],
        'msg_db035fb4-monotonic-assistant': [
          createCanonicalPart({
            id: 'part-assistant-1',
            messageID: 'msg_db035fb4-monotonic-assistant',
            type: 'text',
            text: '你好，我在。',
          }),
        ],
        'msg_d4d34935-random-user-2': [
          createCanonicalPart({
            id: 'part-user-2',
            messageID: 'msg_d4d34935-random-user-2',
            type: 'text',
            text: '你是谁？',
          }),
        ],
        'msg_947188ec-random-user-3': [
          createCanonicalPart({
            id: 'part-user-3',
            messageID: 'msg_947188ec-random-user-3',
            type: 'text',
            text: '继续',
          }),
        ],
      },
    };
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
    });
    const service = new ConversationRenderService(host, {
      getCanonicalSessionState: jest.fn().mockReturnValue(canonicalState),
      hydrateOpenCodeMessage: jest.fn(hydrateCanonicalMessage),
    });

    await service.rerenderConversationMessages(conversation);

    const renderedOrder = [...host.messagesEl.children].map((element) =>
      (element as HTMLElement).dataset.messageId,
    );

    expect(renderedOrder).toEqual([
      'msg_947188ec-random-user-3',
      'msg_c460fc93-random-user-1',
      'msg_db035fb4-monotonic-assistant',
      'msg_d4d34935-random-user-2',
    ]);
    expect(host.createUserMessageFrame).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'msg_c460fc93-random-user-1',
      content: '你好',
    }));
    expect(host.assistantShellRender.renderPersistedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg_db035fb4-monotonic-assistant',
        content: '你好，我在。',
      }),
    );
  });
});
