import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailStatePlanningContextInputs } from '../../../../src/features/chat/services/TrailingAssistantPatchTailStatePlanningContextInputsHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailStatePlanningContextInputsHelper', () => {
  it('builds tail-state planning-context inputs from tail-outcome source fields', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');

    const inputs = buildTrailingAssistantPatchTailStatePlanningContextInputs({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });

    expect(inputs).toEqual({
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
    expect(inputs.nextTailMessage).toBe(nextTailMessage);
    expect('previousTailMessage' in inputs).toBe(false);
  });
});
