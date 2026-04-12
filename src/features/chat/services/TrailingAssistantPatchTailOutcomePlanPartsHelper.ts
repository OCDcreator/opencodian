import type { TrailingAssistantPatchCompletionDebugPlan } from './TrailingAssistantPatchCompletionDebugPlanHelper';
import type { TrailingAssistantPatchTailStatePlan } from './TrailingAssistantPatchTailStateApplierHelper';

export type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export function buildTrailingAssistantPatchTailOutcomePlanParts(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlanParts {
  return {
    tailStatePlan: planParts.tailStatePlan,
    completionDebugPlan: planParts.completionDebugPlan,
  };
}
