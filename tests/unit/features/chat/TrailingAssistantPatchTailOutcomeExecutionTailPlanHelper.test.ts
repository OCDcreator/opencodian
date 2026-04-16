import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext } from '../../../../src/features/chat/services/TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper', () => {
  it('builds tail-outcome plans from execution-tail planning context', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({
      id: 'assistant-2',
      content: 'After',
      sourceMessageId: 'source-2',
    });
    const messageEl = document.createElement('article');
    const summarizedMessages: Array<string | null | undefined> = [];

    expect(
      buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          patchTarget: {
            messageEl,
            contentEl: document.createElement('div'),
          },
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
      tailStatePlan: {
        messageEl,
        messageId: 'assistant-2',
        sourceMessageId: 'source-2',
        shouldStickToBottom: true,
      },
      completionDebugPlan: {
        shouldStickToBottom: true,
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
