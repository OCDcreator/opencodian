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

describe('ConversationRenderService canonical read-path migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('R-1: resolveConversationRenderMessages lazy fallback', () => {
    it('does not access conversation.messages when canonical state is available', async () => {
      const staleMessages = [
        createMessage({ id: 'stale-user', role: 'user', content: 'old' }),
        createMessage({ id: 'stale-assistant', content: 'old reply' }),
      ];
      let messagesAccessCount = 0;
      const conversation = createConversation([]);
      // Install a counting getter on conversation.messages to prove it is not read
      Object.defineProperty(conversation, 'messages', {
        get() {
          messagesAccessCount++;
          return staleMessages;
        },
        configurable: true,
      });

      const canonicalState: OpenCodeCanonicalSessionState = {
        sessionID: 'session-1',
        messages: [
          createCanonicalMessage({ id: 'canonical-user', role: 'user', time: { created: 1 } }),
          createCanonicalMessage({ id: 'canonical-assistant', role: 'assistant', time: { created: 2 } }),
        ],
        partsByMessageID: {
          'canonical-user': [
            createCanonicalPart({ id: 'p1', messageID: 'canonical-user', type: 'text', text: 'new' }),
          ],
          'canonical-assistant': [
            createCanonicalPart({ id: 'p2', messageID: 'canonical-assistant', type: 'text', text: 'new reply' }),
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

      // conversation.messages should not have been accessed because canonical state was available
      expect(messagesAccessCount).toBe(0);

      // Verify canonical messages were rendered
      const renderedIds = [...host.messagesEl.children].map(
        (el) => (el as HTMLElement).dataset.messageId,
      );
      expect(renderedIds).toEqual(['canonical-user', 'canonical-assistant']);
    });

    it('falls back to conversation.messages when canonical state is empty', async () => {
      const fallbackMessages = [
        createMessage({ id: 'fb-user', role: 'user', content: 'fallback' }),
      ];
      const conversation = createConversation(fallbackMessages);

      const host = createHost({
        getCurrentConversation: jest.fn().mockReturnValue(conversation),
      });
      const service = new ConversationRenderService(host, {
        getCanonicalSessionState: jest.fn().mockReturnValue(null),
        hydrateOpenCodeMessage: jest.fn(),
      });

      await service.rerenderConversationMessages(conversation);

      // Fallback messages should be rendered
      const renderedIds = [...host.messagesEl.children].map(
        (el) => (el as HTMLElement).dataset.messageId,
      );
      expect(renderedIds).toEqual(['fb-user']);
    });
  });

  describe('R-2: diagnostic logging uses resolved messages', () => {
    it('logs canonical message count and tail assistant instead of raw conversation.messages', async () => {
      const staleMessages = [
        createMessage({ id: 'stale-u', role: 'user', content: 'old' }),
        createMessage({ id: 'stale-a', content: 'stale reply' }),
      ];
      const canonicalState: OpenCodeCanonicalSessionState = {
        sessionID: 'session-1',
        messages: [
          createCanonicalMessage({ id: 'c-user', role: 'user', time: { created: 10 } }),
          createCanonicalMessage({ id: 'c-assistant', role: 'assistant', time: { created: 20 } }),
        ],
        partsByMessageID: {
          'c-user': [
            createCanonicalPart({ id: 'p-u', messageID: 'c-user', type: 'text', text: 'canonical q' }),
          ],
          'c-assistant': [
            createCanonicalPart({ id: 'p-a', messageID: 'c-assistant', type: 'text', text: 'canonical a' }),
          ],
        },
      };

      const conversation = createConversation(staleMessages);
      const host = createHost({
        getCurrentConversation: jest.fn().mockReturnValue(conversation),
      });
      const service = new ConversationRenderService(host, {
        getCanonicalSessionState: jest.fn().mockReturnValue(canonicalState),
        hydrateOpenCodeMessage: jest.fn(hydrateCanonicalMessage),
      });

      await service.rerenderConversationMessages(conversation);

      // The start diagnostic log should reflect the resolved (canonical) message count,
      // not the raw conversation.messages count
      const startLog = host.logAssistantFinalizationDebug.mock.calls.find(
        (call) => call[0] === 'rerender-conversation-messages-start',
      );
      expect(startLog).toBeDefined();
      expect(startLog![1].messageCount).toBe(2); // canonical count, not stale count
      // Tail assistant should be the canonical assistant, not the stale one
      expect(startLog![1].tailAssistant).toEqual(
        expect.objectContaining({ id: 'c-assistant' }),
      );
    });

    it('logs raw conversation.messages when canonical state is unavailable', async () => {
      const fallbackMessages = [
        createMessage({ id: 'fb-u', role: 'user', content: 'hello' }),
        createMessage({ id: 'fb-a', content: 'world' }),
        createMessage({ id: 'fb-u2', role: 'user', content: 'second' }),
      ];
      const conversation = createConversation(fallbackMessages);

      const host = createHost({
        getCurrentConversation: jest.fn().mockReturnValue(conversation),
      });
      const service = new ConversationRenderService(host, {
        getCanonicalSessionState: jest.fn().mockReturnValue(null),
        hydrateOpenCodeMessage: jest.fn(),
      });

      await service.rerenderConversationMessages(conversation);

      const startLog = host.logAssistantFinalizationDebug.mock.calls.find(
        (call) => call[0] === 'rerender-conversation-messages-start',
      );
      expect(startLog).toBeDefined();
      expect(startLog![1].messageCount).toBe(3); // raw fallback count
      expect(startLog![1].tailAssistant).toEqual(
        expect.objectContaining({ id: 'fb-a' }),
      );
    });
  });
});
