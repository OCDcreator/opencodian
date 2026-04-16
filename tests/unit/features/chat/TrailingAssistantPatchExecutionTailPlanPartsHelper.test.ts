import { buildTrailingAssistantPatchExecutionTailPlanParts } from '../../../../src/features/chat/services/TrailingAssistantPatchExecutionTailPlanPartsHelper';

describe('TrailingAssistantPatchExecutionTailPlanPartsHelper', () => {
  it('builds execution/tail plan parts from precomputed child plans', () => {
    const executionPlan = {
      kind: 'rerender-content' as const,
      messageEl: document.createElement('article'),
      contentEl: document.createElement('div'),
      nextTailMessage: {
        id: 'assistant-2',
        role: 'assistant' as const,
        content: 'After',
        timestamp: 2,
      },
    };
    const tailOutcomePlans = {
      tailStatePlan: {
        messageEl: document.createElement('article'),
        messageId: 'assistant-2',
        sourceMessageId: 'assistant-1',
        shouldStickToBottom: true,
      },
      completionDebugPlan: {
        shouldStickToBottom: true,
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'assistant-2' },
      },
    };

    expect(
      buildTrailingAssistantPatchExecutionTailPlanParts({
        executionPlan,
        tailOutcomePlans,
      }),
    ).toEqual({
      executionPlan,
      tailOutcomePlans,
    });
  });
});
