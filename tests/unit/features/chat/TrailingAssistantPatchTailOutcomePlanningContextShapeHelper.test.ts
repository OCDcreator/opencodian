import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailOutcomePlanningContextShape } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailOutcomePlanningContextShapeHelper', () => {
  it('builds the final tail-outcome planning-context shape from inputs', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');

    const planningContext = buildTrailingAssistantPatchTailOutcomePlanningContextShape({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });

    expect(planningContext).toEqual({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
    expect(planningContext.previousTailMessage).toBe(previousTailMessage);
    expect(planningContext.nextTailMessage).toBe(nextTailMessage);
  });
});
