import { buildTrailingAssistantPatchCompletionDebugPlanningContextInputs } from '../../../../src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper';

describe('TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper', () => {
  it('builds planning-context shape inputs from tail state and summary plan', () => {
    const summaryPlan = {
      previousTail: {
        id: 'assistant-1',
      },
      nextTail: {
        id: 'assistant-2',
      },
    };

    const inputs = buildTrailingAssistantPatchCompletionDebugPlanningContextInputs({
      tailStatePlan: {
        shouldStickToBottom: true,
      },
      summaryPlan,
    });

    expect(inputs).toEqual({
      shouldStickToBottom: true,
      summaryPlan,
    });
    expect(inputs.summaryPlan).toBe(summaryPlan);
  });
});
