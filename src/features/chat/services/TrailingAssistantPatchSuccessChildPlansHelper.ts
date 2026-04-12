import { buildTrailingAssistantPatchExecutionTailPlanParts } from './TrailingAssistantPatchExecutionTailPlanPartsHelper';
import {
  buildTrailingAssistantPatchTurnBodyScopePlan,
  type TrailingAssistantPatchTurnBodyScopePlanSource,
} from './TrailingAssistantPatchTurnBodyScopePlanHelper';
import {
  buildTrailingAssistantPatchSuccessPlanFromParts,
  type TrailingAssistantPatchSuccessPlan,
  type TrailingAssistantPatchSuccessPlanParts,
} from './TrailingAssistantPatchSuccessPlanHelper';

export type TrailingAssistantPatchSuccessChildPlans =
  TrailingAssistantPatchSuccessPlanParts;

export type TrailingAssistantPatchSuccessPlanChildPlanSource =
  Omit<TrailingAssistantPatchSuccessChildPlans, 'turnBodyScopePlan'> & {
    turnBodyScopePlanSource: TrailingAssistantPatchTurnBodyScopePlanSource;
  };

export function buildTrailingAssistantPatchSuccessPlanFromChildPlans(
  childPlans: TrailingAssistantPatchSuccessChildPlans,
): TrailingAssistantPatchSuccessPlan {
  return buildTrailingAssistantPatchSuccessPlanFromParts({
    ...buildTrailingAssistantPatchExecutionTailPlanParts({
      executionPlan: childPlans.executionPlan,
      tailOutcomePlans: childPlans.tailOutcomePlans,
    }),
    turnBodyScopePlan: childPlans.turnBodyScopePlan,
  });
}

export function buildTrailingAssistantPatchSuccessPlanFromChildPlanSource(
  source: TrailingAssistantPatchSuccessPlanChildPlanSource,
): TrailingAssistantPatchSuccessPlan {
  return buildTrailingAssistantPatchSuccessPlanFromChildPlans({
    executionPlan: source.executionPlan,
    tailOutcomePlans: source.tailOutcomePlans,
    turnBodyScopePlan: buildTrailingAssistantPatchTurnBodyScopePlan(
      source.turnBodyScopePlanSource,
    ),
  });
}
