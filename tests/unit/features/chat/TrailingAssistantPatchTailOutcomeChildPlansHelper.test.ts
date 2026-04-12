import type { TrailingAssistantPatchTailStatePlan } from '../../../../src/features/chat/services/TrailingAssistantPatchTailStateApplierHelper';
import { buildTrailingAssistantPatchTailOutcomePlansFromChildPlans } from '../../../../src/features/chat/services/TrailingAssistantPatchTailOutcomeChildPlansHelper';

describe('TrailingAssistantPatchTailOutcomeChildPlansHelper', () => {
  it('builds tail-outcome plans from precomputed child plans', () => {
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
      buildTrailingAssistantPatchTailOutcomePlansFromChildPlans({
        tailStatePlan,
        completionDebugPlan,
      }),
    ).toEqual({
      tailStatePlan,
      completionDebugPlan,
    });
  });
});
