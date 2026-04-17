import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailStatePlanningContextShape } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailStatePlanningContextShapeHelper', () => {
  it('builds the final tail-state planning-context shape from inputs', () => {
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');

    const planningContext = buildTrailingAssistantPatchTailStatePlanningContextShape({
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });

    expect(planningContext).toEqual({
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
    expect(planningContext.nextTailMessage).toBe(nextTailMessage);
  });
});
