import type { ChatMessage } from '../../../../src/core/types';
import { cloneMessagesBeforeForkTarget } from '../../../../src/features/chat/forkMessages';

function createMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'content' | 'timestamp'>,
): ChatMessage {
  return {
    ...overrides,
  };
}

describe('cloneMessagesBeforeForkTarget', () => {
  it('excludes the clicked target message from the fork snapshot', () => {
    const messages: ChatMessage[] = [
      createMessage({
        id: 'local-user-1',
        sourceMessageId: 'msg-user-1',
        role: 'user',
        content: '请简单回复：CRUD smoke test',
        timestamp: 1,
      }),
      createMessage({
        id: 'local-assistant-1',
        sourceMessageId: 'msg-assistant-1',
        role: 'assistant',
        content: 'CRUD smoke test verifies...',
        timestamp: 2,
      }),
      createMessage({
        id: 'local-user-2',
        sourceMessageId: 'msg-user-2',
        role: 'user',
        content: '很好鼓励你',
        timestamp: 3,
      }),
    ];

    const result = cloneMessagesBeforeForkTarget(messages, messages[2]);

    expect(result).toHaveLength(2);
    expect(result.map((message) => message.id)).toEqual(['local-user-1', 'local-assistant-1']);
  });

  it('falls back to sourceMessageId matching when local ids differ', () => {
    const messages: ChatMessage[] = [
      createMessage({
        id: 'local-user-1',
        sourceMessageId: 'msg-user-1',
        role: 'user',
        content: 'first',
        timestamp: 1,
      }),
      createMessage({
        id: 'local-user-2',
        sourceMessageId: 'msg-user-2',
        role: 'user',
        content: 'second',
        timestamp: 2,
      }),
    ];

    const result = cloneMessagesBeforeForkTarget(messages, {
      id: 'different-local-id',
      sourceMessageId: 'msg-user-2',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('local-user-1');
  });
});
