import {
  type TrailingAssistantPatchTurnBodyScopePlan,
  withTrailingAssistantTurnBodyScope,
} from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createScopePlan(
  overrides: Partial<Extract<TrailingAssistantPatchTurnBodyScopePlan, { runtime: object }>> = {},
): Extract<TrailingAssistantPatchTurnBodyScopePlan, { runtime: object }> {
  const restoreTurnBodyEl = document.createElement('div');
  return {
    runtime: {
      currentTurnBodyEl: restoreTurnBodyEl,
    },
    scopedTurnBodyEl: document.createElement('section'),
    restoreTurnBodyEl,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTurnBodyScopeHelper', () => {
  it('runs without swapping turn body state when no runtime is available', async () => {
    const run = jest.fn(async () => 'patched');

    await expect(
      withTrailingAssistantTurnBodyScope({ runtime: null }, run),
    ).resolves.toBe('patched');

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('temporarily scopes the current turn body and restores it after success', async () => {
    const restoreTurnBodyEl = document.createElement('div');
    const scopedTurnBodyEl = document.createElement('section');
    const runtime = {
      currentTurnBodyEl: restoreTurnBodyEl,
    };

    const result = await withTrailingAssistantTurnBodyScope(
      createScopePlan({
        runtime,
        scopedTurnBodyEl,
        restoreTurnBodyEl,
      }),
      async () => {
        expect(runtime.currentTurnBodyEl).toBe(scopedTurnBodyEl);
        return 'patched';
      },
    );

    expect(result).toBe('patched');
    expect(runtime.currentTurnBodyEl).toBe(restoreTurnBodyEl);
  });

  it('restores the planned turn body after scoped work fails', async () => {
    const renderError = new Error('render failed');
    const restoreTurnBodyEl = document.createElement('div');
    const scopedTurnBodyEl = document.createElement('section');
    const transientTurnBodyEl = document.createElement('article');
    const runtime = {
      currentTurnBodyEl: null,
    };

    await expect(
      withTrailingAssistantTurnBodyScope(
        createScopePlan({
          runtime,
          scopedTurnBodyEl,
          restoreTurnBodyEl,
        }),
        async () => {
          expect(runtime.currentTurnBodyEl).toBe(scopedTurnBodyEl);
          runtime.currentTurnBodyEl = transientTurnBodyEl;
          throw renderError;
        },
      ),
    ).rejects.toThrow('render failed');

    expect(runtime.currentTurnBodyEl).toBe(restoreTurnBodyEl);
  });
});
