import { buildTrailingAssistantPatchCompletionDebugPlan } from '../../../../src/features/chat/services/TrailingAssistantPatchCompletionDebugPlanHelper';

describe('TrailingAssistantPatchCompletionDebugPlanHelper', () => {
  it('builds the completion-debug plan from planning context', () => {
    expect(
      buildTrailingAssistantPatchCompletionDebugPlan({
        shouldStickToBottom: true,
        summaryPlan: {
          previousTail: {
            id: 'assistant-1',
            content: 'Before',
          },
          nextTail: {
            id: 'assistant-2',
            content: 'After',
          },
        },
      }),
    ).toEqual({
      shouldStickToBottom: true,
      previousTail: {
        id: 'assistant-1',
        content: 'Before',
      },
      nextTail: {
        id: 'assistant-2',
        content: 'After',
      },
    });
  });
});
