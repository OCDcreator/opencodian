import type { TrailingAssistantPatchCompletionDebugPlan } from './TrailingAssistantPatchCompletionDebugPlanHelper';
import type { TrailingAssistantPatchTailOutcomePlanParts } from './TrailingAssistantPatchTailOutcomePlanPartsHelper';
import type { TrailingAssistantPatchTailStatePlan } from './TrailingAssistantPatchTailStateApplierHelper';

export type TrailingAssistantPatchTailOutcomePlans = {
  tailStatePlan: TrailingAssistantPatchTailStatePlan;
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlan;
};

export type { TrailingAssistantPatchTailOutcomePlanParts } from './TrailingAssistantPatchTailOutcomePlanPartsHelper';

export function buildTrailingAssistantPatchTailOutcomePlans(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlans {
  return {
    tailStatePlan: planParts.tailStatePlan,
    completionDebugPlan: planParts.completionDebugPlan,
  };
}
