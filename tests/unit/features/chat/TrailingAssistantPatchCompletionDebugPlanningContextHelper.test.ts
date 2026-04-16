import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugPlanningContext } from '../../../../src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugPlanningContextHelper', () => {
  it('builds completion-debug planning inputs from tail-outcome context', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const summarizedMessages: Array<string | null | undefined> = [];

    expect(
      buildTrailingAssistantPatchCompletionDebugPlanningContext({
        previousTailMessage,
        nextTailMessage,
        messageEl: document.createElement('article'),
        shouldStickToBottom: false,
        tailStatePlan: {
          shouldStickToBottom: true,
        },
        summarizeChatMessageForDebug: (message) => {
          summarizedMessages.push(message?.id);
          return message
            ? {
              id: message.id,
              content: message.content,
            }
            : null;
        },
      }),
    ).toEqual({
      shouldStickToBottom: true,
      summaryPlan: {
        previousTail: {
          id: 'assistant-1',
          content: 'Before',
        },
        nextTail: {
          id: 'assistant-2',
          content: 'After',
        },
      },
    });

    expect(summarizedMessages).toEqual(['assistant-1', 'assistant-2']);
  });
});
