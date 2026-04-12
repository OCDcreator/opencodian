import type { TrailingAssistantPatchCompletionDebugPlanningContext } from './TrailingAssistantPatchCompletionDebugPlanningContextHelper';

export type TrailingAssistantPatchCompletionDebugPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export function buildTrailingAssistantPatchCompletionDebugPlan(
  planningContext: TrailingAssistantPatchCompletionDebugPlanningContext,
): TrailingAssistantPatchCompletionDebugPlan {
  return {
    shouldStickToBottom: planningContext.shouldStickToBottom,
    previousTail: planningContext.summaryPlan.previousTail,
    nextTail: planningContext.summaryPlan.nextTail,
  };
}
