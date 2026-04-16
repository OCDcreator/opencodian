import {
  buildTrailingAssistantPatchSuccessPlanFromChildPlans,
  buildTrailingAssistantPatchSuccessPlanFromChildPlanSource,
} from '../../../../src/features/chat/services/TrailingAssistantPatchSuccessChildPlansHelper';

describe('TrailingAssistantPatchSuccessChildPlansHelper', () => {
  it('builds the final success plan from precomputed child plans', () => {
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
      buildTrailingAssistantPatchSuccessPlanFromChildPlans({
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

  it('builds the turn-body scope plan before assembling the final success plan', () => {
    const executionPlan = {
      kind: 'finalize-footer' as const,
      messageEl: document.createElement('article'),
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
      shouldStickToBottom: false,
    };
    const completionDebugPlan = {
      shouldStickToBottom: false,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'assistant-2' },
    };
    const parentEl = document.createElement('section');
    const restoreTurnBodyEl = document.createElement('article');
    const runtime = {
      currentTurnBodyEl: restoreTurnBodyEl,
    };

    expect(
      buildTrailingAssistantPatchSuccessPlanFromChildPlanSource({
        executionPlan,
        tailOutcomePlans: {
          tailStatePlan,
          completionDebugPlan,
        },
        turnBodyScopePlanSource: {
          runtime,
          parentEl,
        },
      }),
    ).toEqual({
      executionPlan,
      tailStatePlan,
      completionDebugPlan,
      turnBodyScopePlan: {
        runtime,
        scopedTurnBodyEl: parentEl,
        restoreTurnBodyEl,
      },
    });
  });
});
