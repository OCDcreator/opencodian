import type { TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs } from './TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper';
import type { TrailingAssistantPatchCompletionDebugTailStatePlan } from './TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper';
import type { TrailingAssistantPatchCompletionDebugSummaryPlan } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

export type TrailingAssistantPatchCompletionDebugPlanningContextInputsParts = {
  tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

export function buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextInputsParts,
): TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs {
  return {
    shouldStickToBottom: parts.tailStatePlan.shouldStickToBottom,
    summaryPlan: parts.summaryPlan,
  };
}
