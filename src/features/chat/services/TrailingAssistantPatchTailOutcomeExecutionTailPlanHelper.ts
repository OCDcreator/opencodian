import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import { buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext } from './TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper';
import type { TrailingAssistantPatchExecutionTailPlanningContext } from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlans,
  type TrailingAssistantPatchTailOutcomePlans,
} from './TrailingAssistantPatchTailOutcomePlanHelper';
import { buildTrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';
import { buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext } from './TrailingAssistantPatchTailStateTailOutcomePlanHelper';

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
): TrailingAssistantPatchTailOutcomePlans {
  const planningContext = buildTrailingAssistantPatchTailOutcomePlanningContext(
    source.planningContext,
  );
  const tailStatePlan =
    buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(planningContext);

  return buildTrailingAssistantPatchTailOutcomePlans({
    tailStatePlan,
    completionDebugPlan:
      buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext({
        planningContext,
        tailStatePlan,
        summarizeChatMessageForDebug: source.summarizeChatMessageForDebug,
      }),
  });
}
