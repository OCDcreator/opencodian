import { buildTrailingAssistantPatchTailOutcomePlanParts } from '../../../../src/features/chat/services/TrailingAssistantPatchTailOutcomePlanPartsHelper';

describe('TrailingAssistantPatchTailOutcomePlanPartsHelper', () => {
  it('builds tail-outcome plan parts from precomputed child plans', () => {
    const tailStatePlan = {
      messageEl: document.createElement('article'),
      messageId: 'assistant-2',
      sourceMessageId: 'assistant-1',
      shouldStickToBottom: true,
    };
    const completionDebugPlan = {
      shouldStickToBottom: false,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'assistant-2' },
    };

    expect(
      buildTrailingAssistantPatchTailOutcomePlanParts({
        tailStatePlan,
        completionDebugPlan,
      }),
    ).toEqual({
      tailStatePlan,
      completionDebugPlan,
    });
  });
});
