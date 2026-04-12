import {
  buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext,
} from './TrailingAssistantPatchExecutionTailExecutionPlanHelper';
import {
  buildTrailingAssistantPatchExecutionTailPlanParts,
  type TrailingAssistantPatchExecutionTailPlanParts,
} from './TrailingAssistantPatchExecutionTailPlanPartsHelper';
import {
  shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext,
  type TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource,
} from './TrailingAssistantPatchFooterFinalizationExecutionTailDecisionHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext,
  type TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
} from './TrailingAssistantPatchTailOutcomeExecutionTailPlanHelper';

export type TrailingAssistantPatchExecutionTailChildPlanSource =
  TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource &
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSource;

export function buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailChildPlanSource,
): TrailingAssistantPatchExecutionTailPlanParts {
  const shouldFinalizeFooterOnly =
    shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext(source);

  return buildTrailingAssistantPatchExecutionTailPlanParts({
    executionPlan: buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext({
      planningContext: source.planningContext,
      shouldFinalizeFooterOnly,
    }),
    tailOutcomePlans: buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
      source,
    ),
  });
}
