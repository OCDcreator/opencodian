import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugPlanningContextSource } from '../../../../src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugPlanningContextSourceHelper', () => {
  it('builds completion-debug planning-context sources from tail-outcome inputs', () => {
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
      buildTrailingAssistantPatchCompletionDebugPlanningContextSource({
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
