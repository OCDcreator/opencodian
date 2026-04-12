import { buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext } from './TrailingAssistantPatchCompletionDebugTailOutcomePlanHelper';
import { buildTrailingAssistantPatchTailOutcomePlansFromChildPlans } from './TrailingAssistantPatchTailOutcomeChildPlansHelper';
import {
  type TrailingAssistantPatchTailOutcomePlans,
} from './TrailingAssistantPatchTailOutcomePlanHelper';
import {
  buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract,
  type TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
} from './TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractHelper';
import { buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext } from './TrailingAssistantPatchTailStateTailOutcomePlanHelper';

export type TrailingAssistantPatchTailOutcomeExecutionTailPlanSource =
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts;

export function buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
): TrailingAssistantPatchTailOutcomePlans {
  const sourceContract =
    buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract(
      source,
    );
  const tailStatePlan =
    buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
      sourceContract.planningContext,
    );
  const completionDebugPlan =
    buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext({
      planningContext: sourceContract.planningContext,
      tailStatePlan,
      summarizeChatMessageForDebug: sourceContract.summarizeChatMessageForDebug,
    });

  return buildTrailingAssistantPatchTailOutcomePlansFromChildPlans({
    tailStatePlan,
    completionDebugPlan,
  });
}
