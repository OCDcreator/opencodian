import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailStatePlanningContext } from '../../../../src/features/chat/services/TrailingAssistantPatchTailStatePlanningContextHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailStatePlanningContextHelper', () => {
  it('narrows tail-outcome planning state to tail-state inputs', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');
    const planningContext = {
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    };

    expect(
      buildTrailingAssistantPatchTailStatePlanningContext(planningContext),
    ).toEqual({
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
  });
});
