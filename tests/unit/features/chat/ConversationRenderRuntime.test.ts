import type { ChatMessage } from '../../../../src/core/types';
import { getIncrementalRenderedMessageUpdate } from '../../../../src/features/chat/services/ConversationRenderService';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

function compactionDividerSignature(message: ChatMessage): string {
  return JSON.stringify({
    id: message.id,
    content: message.content,
    role: message.role,
    summary: message.summary ?? null,
    compactionDivider: (message as ChatMessage & { compactionDivider?: unknown }).compactionDivider ?? null,
  });
}

describe('compaction divider incremental rendering', () => {
  it('detects live compaction divider insertion as an incremental append', () => {
    const previousMessages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hello' }),
      createMessage({ id: 'assistant-1', role: 'assistant', content: 'Hi' }),
    ];
    const nextMessages: ChatMessage[] = [
      ...previousMessages,
      createMessage({
        id: 'compaction-divider-live',
        role: 'user',
        content: '',
        compactionDivider: { auto: true, overflow: true, tailStartId: 'msg-1' },
      } as ChatMessage & { compactionDivider: unknown }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: compactionDividerSignature,
    });

    expect(result).not.toBeNull();
    expect(result!.appendedRenderedMessages).toHaveLength(1);
    expect('compactionDivider' in result!.appendedRenderedMessages[0]).toBe(true);
  });

  it('detects compaction summary growth under a divider as a trailing assistant patch', () => {
    const previousMessages: ChatMessage[] = [
      createMessage({
        id: 'compaction-divider',
        role: 'user',
        content: '',
        compactionDivider: { auto: true, overflow: false, tailStartId: 'msg-5' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({
        id: 'summary-growing',
        role: 'assistant',
        content: 'Compressed 8 turns',
        summary: true,
      }),
    ];
    const nextMessages: ChatMessage[] = [
      createMessage({
        id: 'compaction-divider',
        role: 'user',
        content: '',
        compactionDivider: { auto: true, overflow: false, tailStartId: 'msg-5' },
      } as ChatMessage & { compactionDivider: unknown }),
      createMessage({
        id: 'summary-growing',
        role: 'assistant',
        content: 'Compressed 8 turns so far. Key decisions.',
        summary: true,
      }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: compactionDividerSignature,
    });

    expect(result).not.toBeNull();
    expect(result!.patchTrailingAssistant).toBe(true);
    expect(result!.appendedRenderedMessages).toHaveLength(0);
  });

  it('does not treat non-summary assistant content growth differently from current behavior', () => {
    const previousMessages: ChatMessage[] = [
      createMessage({
        id: 'assistant-normal',
        role: 'assistant',
        content: 'Partial',
      }),
    ];
    const nextMessages: ChatMessage[] = [
      createMessage({
        id: 'assistant-normal',
        role: 'assistant',
        content: 'Partial answer now complete',
      }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: compactionDividerSignature,
    });

    expect(result).not.toBeNull();
    expect(result!.patchTrailingAssistant).toBe(true);
  });

  it('does not treat ordinary non-compaction summary content changes as a special live-summary append', () => {
    const previousMessages: ChatMessage[] = [
      createMessage({
        id: 'summary-ordinary',
        role: 'assistant',
        content: 'Summary of earlier conversation',
        summary: true,
      }),
    ];
    const nextMessages: ChatMessage[] = [
      createMessage({
        id: 'summary-ordinary',
        role: 'assistant',
        content: 'Summary of earlier conversation (updated)',
        summary: true,
      }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: compactionDividerSignature,
    });

    expect(result).not.toBeNull();
    expect(result!.appendedRenderedMessages).toHaveLength(0);
    expect(result!.patchTrailingAssistant).toBe(true);
  });
});
