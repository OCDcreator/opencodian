import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract } from '../../../../src/features/chat/services/TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper', () => {
  it('narrows execution-tail context and preserves the debug summarizer', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');
    const summarizeChatMessageForDebug = jest.fn((message: ChatMessage | null | undefined) =>
      message
        ? {
          id: message.id,
          content: message.content,
        }
        : null,
    );

    expect(
      buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          patchTarget: {
            messageEl,
            contentEl: document.createElement('div'),
          },
          shouldStickToBottom: true,
        },
        summarizeChatMessageForDebug,
      }),
    ).toEqual({
      planningContext: {
        previousTailMessage,
        nextTailMessage,
        messageEl,
        shouldStickToBottom: true,
      },
      summarizeChatMessageForDebug,
    });
  });
});
