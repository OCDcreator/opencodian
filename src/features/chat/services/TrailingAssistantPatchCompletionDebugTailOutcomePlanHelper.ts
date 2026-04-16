import {
  buildTrailingAssistantPatchCompletionDebugPlan,
  type TrailingAssistantPatchCompletionDebugPlan,
} from './TrailingAssistantPatchCompletionDebugPlanHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPlanningContext,
} from './TrailingAssistantPatchCompletionDebugPlanningContextHelper';
import {
  buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext,
  type TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts,
} from './TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractHelper';

export type TrailingAssistantPatchCompletionDebugTailOutcomePlanParts =
  TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts;

export function buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
): TrailingAssistantPatchCompletionDebugPlan {
  return buildTrailingAssistantPatchCompletionDebugPlan(
    buildTrailingAssistantPatchCompletionDebugPlanningContext(
      buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(parts),
    ),
  );
}
