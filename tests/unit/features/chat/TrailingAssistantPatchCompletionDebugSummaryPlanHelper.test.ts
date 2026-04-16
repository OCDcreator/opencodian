import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchCompletionDebugSummaryPlan } from '../../../../src/features/chat/services/TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchCompletionDebugSummaryPlanHelper', () => {
  it('builds tail-message summaries from the summary source', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const summarizedMessages: Array<string | null | undefined> = [];

    expect(
      buildTrailingAssistantPatchCompletionDebugSummaryPlan({
        previousTailMessage,
        nextTailMessage,
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
