import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper', () => {
  it('builds the final completion-debug source contract from tail-outcome parts', () => {
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
      buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract({
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
