import {
  buildTrailingAssistantPatchCompletionDebugPlan,
  type TrailingAssistantPatchCompletionDebugPlan,
} from './TrailingAssistantPatchCompletionDebugPlanHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPlanningContext,
} from './TrailingAssistantPatchCompletionDebugPlanningContextHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract,
  type TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
} from './TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper';

export type TrailingAssistantPatchCompletionDebugTailOutcomePlanParts =
  TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts;

export function buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
): TrailingAssistantPatchCompletionDebugPlan {
  return buildTrailingAssistantPatchCompletionDebugPlan(
    buildTrailingAssistantPatchCompletionDebugPlanningContext(
      buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(parts),
    ),
  );
}
