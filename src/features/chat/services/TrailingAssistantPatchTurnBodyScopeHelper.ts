export type TrailingAssistantPatchTurnBodyRuntimeState = {
  currentTurnBodyEl: HTMLElement | null;
};

export type TrailingAssistantPatchTurnBodyScopePlan =
  | {
    runtime: null;
  }
  | {
    runtime: TrailingAssistantPatchTurnBodyRuntimeState;
    scopedTurnBodyEl: HTMLElement;
    restoreTurnBodyEl: HTMLElement;
  };

export async function withTrailingAssistantTurnBodyScope<T>(
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan,
  run: () => Promise<T>,
): Promise<T> {
  if (!turnBodyScopePlan.runtime) {
    return run();
  }

  const {
    runtime,
    scopedTurnBodyEl,
    restoreTurnBodyEl,
  } = turnBodyScopePlan;
  runtime.currentTurnBodyEl = scopedTurnBodyEl;

  try {
    return await run();
  } finally {
    runtime.currentTurnBodyEl = restoreTurnBodyEl;
  }
}
