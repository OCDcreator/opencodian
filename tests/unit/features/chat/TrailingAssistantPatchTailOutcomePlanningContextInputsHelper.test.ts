import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailOutcomePlanningContextInputs } from '../../../../src/features/chat/services/TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailOutcomePlanningContextInputsHelper', () => {
  it('builds tail-outcome planning-context inputs from execution-tail source fields', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');

    const inputs = buildTrailingAssistantPatchTailOutcomePlanningContextInputs({
      previousTailMessage,
      nextTailMessage,
      patchTarget: {
        messageEl,
      },
      shouldStickToBottom: true,
    });

    expect(inputs).toEqual({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
    expect(inputs.previousTailMessage).toBe(previousTailMessage);
    expect(inputs.nextTailMessage).toBe(nextTailMessage);
  });
});
