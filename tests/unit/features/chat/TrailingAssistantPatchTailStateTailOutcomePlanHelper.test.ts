import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailStateTailOutcomePlanHelper', () => {
  it('builds the tail-state plan from tail-outcome planning context', () => {
    const planningContext = {
      previousTailMessage: createMessage({ id: 'assistant-1', content: 'Before' }),
      nextTailMessage: createMessage({
        id: 'assistant-2',
        content: 'After',
        sourceMessageId: 'source-2',
      }),
      messageEl: document.createElement('article'),
      shouldStickToBottom: true,
    };

    expect(
      buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(planningContext),
    ).toEqual({
      messageEl: planningContext.messageEl,
      messageId: 'assistant-2',
      sourceMessageId: 'source-2',
      shouldStickToBottom: true,
    });
  });

  it('normalizes a missing source message id to null', () => {
    const planningContext = {
      previousTailMessage: createMessage({ id: 'assistant-1' }),
      nextTailMessage: createMessage({ id: 'assistant-2', sourceMessageId: undefined }),
      messageEl: document.createElement('article'),
      shouldStickToBottom: false,
    };

    expect(
      buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(planningContext),
    ).toEqual({
      messageEl: planningContext.messageEl,
      messageId: 'assistant-2',
      sourceMessageId: null,
      shouldStickToBottom: false,
    });
  });
});
