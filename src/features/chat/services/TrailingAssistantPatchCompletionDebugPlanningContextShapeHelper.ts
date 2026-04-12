import type { TrailingAssistantPatchCompletionDebugSummaryPlan } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

export type TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs = {
  shouldStickToBottom: boolean;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

export type TrailingAssistantPatchCompletionDebugPlanningContext =
  TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs;

export function buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
  inputs: TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  return {
    shouldStickToBottom: inputs.shouldStickToBottom,
    summaryPlan: inputs.summaryPlan,
  };
}
