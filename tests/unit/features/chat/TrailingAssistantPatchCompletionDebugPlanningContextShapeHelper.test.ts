import { buildTrailingAssistantPatchCompletionDebugPlanningContextShape } from '../../../../src/features/chat/services/trailingAssistantPatchPlanning';

describe('TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper', () => {
  it('builds the final completion-debug planning-context shape from inputs', () => {
    const summaryPlan = {
      previousTail: {
        id: 'assistant-1',
      },
      nextTail: {
        id: 'assistant-2',
      },
    };

    const planningContext =
      buildTrailingAssistantPatchCompletionDebugPlanningContextShape({
        shouldStickToBottom: true,
        summaryPlan,
      });

    expect(planningContext).toEqual({
      shouldStickToBottom: true,
      summaryPlan,
    });
    expect(planningContext.summaryPlan).toBe(summaryPlan);
  });
});
