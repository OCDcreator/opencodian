import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchExecutionTailExecutionPlanHelper', () => {
  it('builds a footer-finalization plan from execution-tail planning context', () => {
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const patchTarget = {
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
    };

    expect(
      buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage: createMessage({ id: 'assistant-1', content: 'Before' }),
          nextTailMessage,
          patchTarget,
          shouldStickToBottom: true,
        },
        shouldFinalizeFooterOnly: true,
      }),
    ).toEqual({
      kind: 'finalize-footer',
      messageEl: patchTarget.messageEl,
      nextTailMessage,
    });
  });

  it('builds a content-rerender plan from execution-tail planning context', () => {
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const patchTarget = {
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
    };

    expect(
      buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage: createMessage({ id: 'assistant-1', content: 'Before' }),
          nextTailMessage,
          patchTarget,
          shouldStickToBottom: false,
        },
        shouldFinalizeFooterOnly: false,
      }),
    ).toEqual({
      kind: 'rerender-content',
      messageEl: patchTarget.messageEl,
      contentEl: patchTarget.contentEl,
      nextTailMessage,
    });
  });
});
