import {
  buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext,
} from './TrailingAssistantPatchExecutionTailChildPlansHelper';
import {
  buildTrailingAssistantPatchExecutionTailPlanningContext,
} from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import type { TrailingAssistantPatchSuccessPlanningContextPlanSource } from './TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper';
import {
  buildTrailingAssistantPatchSuccessPlanFromChildPlanSource,
} from './TrailingAssistantPatchSuccessChildPlansHelper';
import type { TrailingAssistantPatchSuccessPlan } from './TrailingAssistantPatchSuccessPlanHelper';

export function buildTrailingAssistantPatchSuccessPlanFromPlanningContext(
  source: TrailingAssistantPatchSuccessPlanningContextPlanSource,
): TrailingAssistantPatchSuccessPlan {
  const executionTailPlanningContext =
    buildTrailingAssistantPatchExecutionTailPlanningContext(source);

  return buildTrailingAssistantPatchSuccessPlanFromChildPlanSource({
    ...buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext({
      planningContext: executionTailPlanningContext,
      getBodySignature: source.getBodySignature,
      summarizeChatMessageForDebug: source.summarizeChatMessageForDebug,
    }),
    turnBodyScopePlanSource: source,
  });
}
