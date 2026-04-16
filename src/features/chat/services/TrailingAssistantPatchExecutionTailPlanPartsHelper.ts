import type { TrailingAssistantPatchExecutionPlan } from './TrailingAssistantPatchExecutionPlanHelper';
import type { TrailingAssistantPatchTailOutcomePlans } from './TrailingAssistantPatchTailOutcomePlanHelper';

export type TrailingAssistantPatchExecutionTailPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
};

export function buildTrailingAssistantPatchExecutionTailPlanParts(
  planParts: TrailingAssistantPatchExecutionTailPlanParts,
): TrailingAssistantPatchExecutionTailPlanParts {
  return {
    executionPlan: planParts.executionPlan,
    tailOutcomePlans: planParts.tailOutcomePlans,
  };
}
