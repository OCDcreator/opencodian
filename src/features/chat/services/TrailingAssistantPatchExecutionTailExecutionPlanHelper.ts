import {
  buildTrailingAssistantPatchExecutionPlan,
  type TrailingAssistantPatchExecutionPlan,
} from './TrailingAssistantPatchExecutionPlanHelper';
import type { TrailingAssistantPatchExecutionTailPlanningContext } from './TrailingAssistantPatchExecutionTailPlanningContextHelper';

export type TrailingAssistantPatchExecutionTailExecutionPlanSource = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  shouldFinalizeFooterOnly: boolean;
};

export function buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan {
  return buildTrailingAssistantPatchExecutionPlan({
    nextTailMessage: source.planningContext.nextTailMessage,
    patchTarget: source.planningContext.patchTarget,
    shouldFinalizeFooterOnly: source.shouldFinalizeFooterOnly,
  });
}
