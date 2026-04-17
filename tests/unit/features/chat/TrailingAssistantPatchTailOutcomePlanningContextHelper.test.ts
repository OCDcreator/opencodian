import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchTailOutcomePlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailOutcomePlanningContextHelper', () => {
  it('narrows execution-tail planning state to tail-outcome inputs', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');
    const planningContext = {
      previousTailMessage,
      nextTailMessage,
      patchTarget: {
        messageEl,
        contentEl: document.createElement('div'),
      },
      shouldStickToBottom: true,
      runtime: {
        currentTurnBodyEl: document.createElement('section'),
      },
    };

    expect(
      buildTrailingAssistantPatchTailOutcomePlanningContext(planningContext),
    ).toEqual({
      previousTailMessage,
      nextTailMessage,
      messageEl,
      shouldStickToBottom: true,
    });
  });
});
