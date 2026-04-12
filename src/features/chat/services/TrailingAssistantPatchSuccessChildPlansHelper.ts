import { buildTrailingAssistantPatchExecutionTailPlanParts } from './TrailingAssistantPatchExecutionTailPlanPartsHelper';
import {
  buildTrailingAssistantPatchSuccessPlanFromParts,
  type TrailingAssistantPatchSuccessPlan,
  type TrailingAssistantPatchSuccessPlanParts,
} from './TrailingAssistantPatchSuccessPlanHelper';

export type TrailingAssistantPatchSuccessChildPlans =
  TrailingAssistantPatchSuccessPlanParts;

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
