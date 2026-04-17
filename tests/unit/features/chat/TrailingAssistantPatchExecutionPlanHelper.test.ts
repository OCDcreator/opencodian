import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchExecutionPlan } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchExecutionPlanHelper', () => {
  it('builds a footer-finalization plan when the body signature is unchanged', () => {
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const patchTarget = {
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
    };

    expect(
      buildTrailingAssistantPatchExecutionPlan({
        nextTailMessage,
        patchTarget,
        shouldFinalizeFooterOnly: true,
      }),
    ).toEqual({
      kind: 'finalize-footer',
      messageEl: patchTarget.messageEl,
      nextTailMessage,
    });
  });

  it('builds a content-rerender plan when the body signature changed', () => {
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const patchTarget = {
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
    };

    expect(
      buildTrailingAssistantPatchExecutionPlan({
        nextTailMessage,
        patchTarget,
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
