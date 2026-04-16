import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchExecutionTailPlanningContext } from '../../../../src/features/chat/services/TrailingAssistantPatchExecutionTailPlanningContextHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchExecutionTailPlanningContextHelper', () => {
  it('narrows trailing assistant planning state to execution-tail inputs', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const patchTarget = {
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
    };
    const planningContext = {
      previousTailMessage,
      nextTailMessage,
      patchTarget,
      shouldStickToBottom: true,
      runtime: {
        currentTurnBodyEl: document.createElement('section'),
      },
      parentEl: document.createElement('section'),
    };

    expect(
      buildTrailingAssistantPatchExecutionTailPlanningContext(planningContext),
    ).toEqual({
      previousTailMessage,
      nextTailMessage,
      patchTarget,
      shouldStickToBottom: true,
    });
  });
});
