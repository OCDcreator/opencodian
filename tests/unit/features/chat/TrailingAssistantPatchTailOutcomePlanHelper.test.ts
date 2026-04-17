import type { TrailingAssistantPatchTailStatePlan } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';
import { buildTrailingAssistantPatchTailOutcomePlans } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

describe('TrailingAssistantPatchTailOutcomePlanHelper', () => {
  it('builds the final tail-outcome plan shape from plan parts', () => {
    const tailStatePlan: TrailingAssistantPatchTailStatePlan = {
      messageEl: document.createElement('article'),
      messageId: 'assistant-2',
      sourceMessageId: 'assistant-1',
      shouldStickToBottom: true,
    };
    const completionDebugPlan = {
      shouldStickToBottom: false,
      previousTail: {
        id: 'assistant-1',
      },
      nextTail: {
        id: 'assistant-2',
      },
    };

    expect(
      buildTrailingAssistantPatchTailOutcomePlans({
        tailStatePlan,
        completionDebugPlan,
      }),
    ).toEqual({
      tailStatePlan,
      completionDebugPlan,
    });
  });
});
