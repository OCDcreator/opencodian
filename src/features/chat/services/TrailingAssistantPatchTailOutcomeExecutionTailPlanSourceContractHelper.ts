import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import type { TrailingAssistantPatchExecutionTailPlanningContext } from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlanningContext,
  type TrailingAssistantPatchTailOutcomePlanningContext,
} from './TrailingAssistantPatchTailOutcomePlanningContextHelper';

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract(
  parts: TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
): TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract {
  return {
    planningContext: buildTrailingAssistantPatchTailOutcomePlanningContext(parts.planningContext),
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}
