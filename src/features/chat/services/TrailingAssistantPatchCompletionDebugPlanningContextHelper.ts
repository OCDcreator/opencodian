import {
  buildTrailingAssistantPatchCompletionDebugPlanningContextInputs,
} from './TrailingAssistantPatchCompletionDebugPlanningContextInputsHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPlanningContextShape,
  type TrailingAssistantPatchCompletionDebugPlanningContext,
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
  const summaryPlan = buildTrailingAssistantPatchCompletionDebugSummaryPlan(source);

  return buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
    buildTrailingAssistantPatchCompletionDebugPlanningContextInputs({
      tailStatePlan: source.tailStatePlan,
      summaryPlan,
    }),
  );
}
