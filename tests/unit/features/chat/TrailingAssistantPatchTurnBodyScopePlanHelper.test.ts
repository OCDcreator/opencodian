import { buildTrailingAssistantPatchTurnBodyScopePlan } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

describe('TrailingAssistantPatchTurnBodyScopePlanHelper', () => {
  it('returns a passthrough plan when no runtime is available', () => {
    const parentEl = document.createElement('section');

    expect(
      buildTrailingAssistantPatchTurnBodyScopePlan({
        runtime: null,
        parentEl,
      }),
    ).toEqual({ runtime: null });
  });

  it('restores the existing current turn body when one is present', () => {
    const parentEl = document.createElement('section');
    const restoreTurnBodyEl = document.createElement('article');
    const runtime = {
      currentTurnBodyEl: restoreTurnBodyEl,
    };

    const plan = buildTrailingAssistantPatchTurnBodyScopePlan({
      runtime,
      parentEl,
    });

    if (!plan.runtime) {
      throw new Error('expected runtime plan');
    }

    expect(plan.runtime).toBe(runtime);
    expect(plan.scopedTurnBodyEl).toBe(parentEl);
    expect(plan.restoreTurnBodyEl).toBe(restoreTurnBodyEl);
  });

  it('falls back to the parent element when there is no current turn body', () => {
    const parentEl = document.createElement('section');
    const runtime = {
      currentTurnBodyEl: null,
    };

    const plan = buildTrailingAssistantPatchTurnBodyScopePlan({
      runtime,
      parentEl,
    });

    if (!plan.runtime) {
      throw new Error('expected runtime plan');
    }

    expect(plan.runtime).toBe(runtime);
    expect(plan.scopedTurnBodyEl).toBe(parentEl);
    expect(plan.restoreTurnBodyEl).toBe(parentEl);
  });
});
