import type {
  TrailingAssistantPatchCompletionDebugPlanningContextSource,
} from './TrailingAssistantPatchCompletionDebugPlanningContextHelper';
import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextHelper';

export type TrailingAssistantPatchCompletionDebugPlanningContextSourceParts = {
  planningContext: TrailingAssistantPatchTailOutcomePlanningContext;
  tailStatePlan: TrailingAssistantPatchCompletionDebugPlanningContextSource['tailStatePlan'];
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchCompletionDebugPlanningContextSource(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextSourceParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource {
  return {
    ...parts.planningContext,
    tailStatePlan: parts.tailStatePlan,
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}
