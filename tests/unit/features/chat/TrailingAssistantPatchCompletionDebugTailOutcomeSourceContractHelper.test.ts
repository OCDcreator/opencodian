import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper', () => {
  it('assembles the completion-debug source contract from tail-outcome parts', () => {
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
      buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          messageEl,
          shouldStickToBottom: false,
        },
        tailStatePlan: {
          shouldStickToBottom: true,
        },
        summarizeChatMessageForDebug,
      }),
    ).toEqual({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: false,
      tailStatePlan: {
        shouldStickToBottom: true,
      },
      summarizeChatMessageForDebug,
    });
  });
});
