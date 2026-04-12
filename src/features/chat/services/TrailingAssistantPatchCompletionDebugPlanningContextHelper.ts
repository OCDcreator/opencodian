import type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';
import {
  buildTrailingAssistantPatchCompletionDebugSummaryPlan,
  type TrailingAssistantPatchCompletionDebugMessageSummarizer,
  type TrailingAssistantPatchCompletionDebugSummaryPlan,
} from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';

type TrailingAssistantPatchCompletionDebugTailStatePlan = {
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

type TrailingAssistantPatchCompletionDebugInputs = {
  shouldStickToBottom: boolean;
  summaryPlan: TrailingAssistantPatchCompletionDebugSummaryPlan;
};

export type TrailingAssistantPatchCompletionDebugPlanningContext =
  TrailingAssistantPatchCompletionDebugInputs;

export function buildTrailingAssistantPatchCompletionDebugPlanningContext(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  return buildTrailingAssistantPatchCompletionDebugPlanningContextFromInputs(
    buildTrailingAssistantPatchCompletionDebugInputs(source),
  );
}

function buildTrailingAssistantPatchCompletionDebugInputs(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugInputs {
  return {
    shouldStickToBottom: source.tailStatePlan.shouldStickToBottom,
    summaryPlan: buildTrailingAssistantPatchCompletionDebugSummaryPlan(source),
  };
}

function buildTrailingAssistantPatchCompletionDebugPlanningContextFromInputs(
  inputs: TrailingAssistantPatchCompletionDebugInputs,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  return {
    shouldStickToBottom: inputs.shouldStickToBottom,
    summaryPlan: inputs.summaryPlan,
  };
}
