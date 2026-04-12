import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import {
  buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext,
} from './TrailingAssistantPatchExecutionTailChildPlansHelper';
import {
  buildTrailingAssistantPatchExecutionTailPlanningContext,
  type TrailingAssistantPatchExecutionTailPlanningContextSource,
} from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import type { TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter } from './TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper';
import {
  buildTrailingAssistantPatchSuccessPlanFromChildPlanSource,
} from './TrailingAssistantPatchSuccessChildPlansHelper';
import type { TrailingAssistantPatchSuccessPlan } from './TrailingAssistantPatchSuccessPlanHelper';
import type { TrailingAssistantPatchTurnBodyScopePlanSource } from './TrailingAssistantPatchTurnBodyScopePlanHelper';

export type TrailingAssistantPatchSuccessPlanningContextPlanSource =
  TrailingAssistantPatchExecutionTailPlanningContextSource &
  TrailingAssistantPatchTurnBodyScopePlanSource & {
    getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

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
