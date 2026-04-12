import type { TrailingAssistantPatchCompletionDebugPlan } from './TrailingAssistantPatchCompletionDebugPlanHelper';
import type { TrailingAssistantPatchTailStatePlan } from './TrailingAssistantPatchTailStateApplierHelper';

export type TrailingAssistantPatchTailOutcomePlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export type TrailingAssistantPatchTailOutcomePlanParts = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export function buildTrailingAssistantPatchTailOutcomePlans(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlans {
  return {
    tailStatePlan: planParts.tailStatePlan,
    completionDebugPlan: planParts.completionDebugPlan,
  };
}
