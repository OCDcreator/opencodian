import type { ChatMessage } from '../../../core/types';
import type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';

type TrailingAssistantPatchCompletionDebugTailStatePlan = {
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchCompletionDebugMessageSummarizer = (
  message: ChatMessage | null | undefined,
) => Record<string, unknown> | null;

export type TrailingAssistantPatchCompletionDebugSummaryPlan = {
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

type TrailingAssistantPatchCompletionDebugSummaryPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
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
    summaryPlan: buildTrailingAssistantPatchCompletionDebugSummaryPlan(
      buildTrailingAssistantPatchCompletionDebugSummaryPlanningContext(source),
    ),
  };
}

function buildTrailingAssistantPatchCompletionDebugSummaryPlanningContext(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugSummaryPlanningContext {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    summarizeChatMessageForDebug: source.summarizeChatMessageForDebug,
  };
}

function buildTrailingAssistantPatchCompletionDebugSummaryPlan(
  planningContext: TrailingAssistantPatchCompletionDebugSummaryPlanningContext,
): TrailingAssistantPatchCompletionDebugSummaryPlan {
  return {
    previousTail: planningContext.summarizeChatMessageForDebug(
      planningContext.previousTailMessage,
    ),
    nextTail: planningContext.summarizeChatMessageForDebug(
      planningContext.nextTailMessage,
    ),
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
