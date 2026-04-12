import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';

export type TrailingAssistantPatchCompletionDebugTailStatePlan = {
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchCompletionDebugPlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContext & {
    tailStatePlan: TrailingAssistantPatchCompletionDebugTailStatePlan;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export function buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource {
  return {
    ...parts.planningContext,
    tailStatePlan: parts.tailStatePlan,
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}
