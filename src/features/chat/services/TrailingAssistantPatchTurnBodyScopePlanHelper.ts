import {
  type TrailingAssistantPatchTurnBodyRuntimeState,
  type TrailingAssistantPatchTurnBodyScopePlan,
} from './TrailingAssistantPatchTurnBodyScopeHelper';

export type TrailingAssistantPatchTurnBodyScopePlanSource = {
  runtime: TrailingAssistantPatchTurnBodyRuntimeState | null;
  parentEl: HTMLElement;
};

type TrailingAssistantPatchTurnBodyScopePlanInputs =
  | {
    runtime: null;
  }
  | {
    runtime: TrailingAssistantPatchTurnBodyRuntimeState;
    scopedTurnBodyEl: HTMLElement;
    restoreTurnBodyEl: HTMLElement;
  };

export function buildTrailingAssistantPatchTurnBodyScopePlan(
  source: TrailingAssistantPatchTurnBodyScopePlanSource,
): TrailingAssistantPatchTurnBodyScopePlan {
  return buildTrailingAssistantPatchTurnBodyScopePlanFromInputs(
    buildTrailingAssistantPatchTurnBodyScopePlanInputs(source),
  );
}

function buildTrailingAssistantPatchTurnBodyScopePlanInputs(
  source: TrailingAssistantPatchTurnBodyScopePlanSource,
): TrailingAssistantPatchTurnBodyScopePlanInputs {
  if (!source.runtime) {
    return { runtime: null };
  }

  return {
    runtime: source.runtime,
    scopedTurnBodyEl: source.parentEl,
    restoreTurnBodyEl: source.runtime.currentTurnBodyEl ?? source.parentEl,
  };
}

function buildTrailingAssistantPatchTurnBodyScopePlanFromInputs(
  inputs: TrailingAssistantPatchTurnBodyScopePlanInputs,
): TrailingAssistantPatchTurnBodyScopePlan {
  if (!inputs.runtime) {
    return { runtime: null };
  }

  return {
    runtime: inputs.runtime,
    scopedTurnBodyEl: inputs.scopedTurnBodyEl,
    restoreTurnBodyEl: inputs.restoreTurnBodyEl,
  };
}
