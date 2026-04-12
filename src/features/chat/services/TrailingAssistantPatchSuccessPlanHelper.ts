import type { TrailingAssistantPatchExecutionTailPlanParts } from './TrailingAssistantPatchExecutionTailPlanPartsHelper';
import type { TrailingAssistantPatchExecutionPlan } from './TrailingAssistantPatchExecutionPlanHelper';
import type { TrailingAssistantPatchTailOutcomePlans } from './TrailingAssistantPatchTailOutcomePlanHelper';
import type { TrailingAssistantPatchTurnBodyScopePlan } from './TrailingAssistantPatchTurnBodyScopeHelper';

export type TrailingAssistantPatchSuccessPlan = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailStatePlan: TrailingAssistantPatchTailOutcomePlans['tailStatePlan'];
  completionDebugPlan: TrailingAssistantPatchTailOutcomePlans['completionDebugPlan'];
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export type TrailingAssistantPatchSuccessPlanParts =
  TrailingAssistantPatchExecutionTailPlanParts & {
    turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
  };

export function buildTrailingAssistantPatchSuccessPlanFromParts(
  planParts: TrailingAssistantPatchSuccessPlanParts,
): TrailingAssistantPatchSuccessPlan {
  return {
    executionPlan: planParts.executionPlan,
    tailStatePlan: planParts.tailOutcomePlans.tailStatePlan,
    completionDebugPlan: planParts.tailOutcomePlans.completionDebugPlan,
    turnBodyScopePlan: planParts.turnBodyScopePlan,
  };
}
