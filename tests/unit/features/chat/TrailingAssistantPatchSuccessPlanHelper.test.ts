import { buildTrailingAssistantPatchSuccessPlanFromParts } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

describe('TrailingAssistantPatchSuccessPlanHelper', () => {
  it('builds the final success-plan shape from execution, tail-outcome, and turn-body parts', () => {
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
    const tailStatePlan = {
      messageEl: document.createElement('article'),
      messageId: 'assistant-2',
      sourceMessageId: 'assistant-1',
      shouldStickToBottom: true,
    };
    const completionDebugPlan = {
      shouldStickToBottom: true,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'assistant-2' },
    };
    const turnBodyScopePlan = {
      runtime: null,
    };

    expect(
      buildTrailingAssistantPatchSuccessPlanFromParts({
        executionPlan,
        tailOutcomePlans: {
          tailStatePlan,
          completionDebugPlan,
        },
        turnBodyScopePlan,
      }),
    ).toEqual({
      executionPlan,
      tailStatePlan,
      completionDebugPlan,
      turnBodyScopePlan,
    });
  });
});
