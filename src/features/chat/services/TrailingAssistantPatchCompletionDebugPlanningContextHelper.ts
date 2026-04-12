import {
  buildTrailingAssistantPatchCompletionDebugPlanningContextShape,
  type TrailingAssistantPatchCompletionDebugPlanningContext,
  type TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
} from './TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper';
import type { TrailingAssistantPatchCompletionDebugPlanningContextSource } from './TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper';
import {
  buildTrailingAssistantPatchCompletionDebugSummaryPlan,
} from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

export type { TrailingAssistantPatchCompletionDebugPlanningContext } from './TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper';
export type { TrailingAssistantPatchCompletionDebugPlanningContextSource } from './TrailingAssistantPatchCompletionDebugPlanningContextSourceContractHelper';

export function buildTrailingAssistantPatchCompletionDebugPlanningContext(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  return buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
    buildTrailingAssistantPatchCompletionDebugInputs(source),
  );
}

function buildTrailingAssistantPatchCompletionDebugInputs(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs {
  return {
    shouldStickToBottom: source.tailStatePlan.shouldStickToBottom,
    summaryPlan: buildTrailingAssistantPatchCompletionDebugSummaryPlan(source),
  };
}
