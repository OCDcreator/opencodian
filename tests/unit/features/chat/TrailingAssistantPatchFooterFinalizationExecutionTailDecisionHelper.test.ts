import type { ChatMessage } from '../../../../src/core/types';
import { shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper', () => {
  it('finalizes only the footer when both body signatures match', () => {
    expect(
      shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage: createMessage({ id: 'assistant-1', content: 'Stable answer' }),
          nextTailMessage: createMessage({ id: 'assistant-2', content: 'Stable answer' }),
          patchTarget: {
            messageEl: document.createElement('article'),
            contentEl: document.createElement('div'),
          },
          shouldStickToBottom: true,
        },
        getBodySignature: (message) => `${message.role}:${message.content}`,
      }),
    ).toBe(true);
  });

  it('requests a full content rerender when the body signature changes', () => {
    expect(
      shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage: createMessage({ id: 'assistant-1', content: 'Before' }),
          nextTailMessage: createMessage({ id: 'assistant-2', content: 'After' }),
          patchTarget: {
            messageEl: document.createElement('article'),
            contentEl: document.createElement('div'),
          },
          shouldStickToBottom: false,
        },
        getBodySignature: (message) => `${message.role}:${message.content}`,
      }),
    ).toBe(false);
  });
});
