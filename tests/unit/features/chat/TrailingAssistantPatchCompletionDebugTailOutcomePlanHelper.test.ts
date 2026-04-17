import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper', () => {
  it('builds completion-debug plan from tail-outcome context parts', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const summarizedMessages: Array<string | null | undefined> = [];

    expect(
      buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          messageEl: document.createElement('article'),
          shouldStickToBottom: false,
        },
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
      previousTail: {
        id: 'assistant-1',
        content: 'Before',
      },
      nextTail: {
        id: 'assistant-2',
        content: 'After',
      },
    });

    expect(summarizedMessages).toEqual(['assistant-1', 'assistant-2']);
  });
});
