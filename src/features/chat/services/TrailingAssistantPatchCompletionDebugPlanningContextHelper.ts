import type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPlanningContextShape,
  type TrailingAssistantPatchCompletionDebugPlanningContext,
  type TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
} from './TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper';
import {
  buildTrailingAssistantPatchCompletionDebugSummaryPlan,
  type TrailingAssistantPatchCompletionDebugMessageSummarizer,
} from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

type TrailingAssistantPatchCompletionDebugTailStatePlan = {
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export type { TrailingAssistantPatchCompletionDebugPlanningContext } from './TrailingAssistantPatchCompletionDebugPlanningContextShapeHelper';

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
