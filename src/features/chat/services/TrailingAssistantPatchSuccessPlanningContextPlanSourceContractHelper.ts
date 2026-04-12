import type { TrailingAssistantPatchCompletionDebugMessageSummarizer } from './TrailingAssistantPatchCompletionDebugSummaryPlanHelper';
import type { TrailingAssistantPatchExecutionTailPlanningContextSource } from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import type { TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter } from './TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper';
import type { TrailingAssistantPatchTurnBodyScopePlanSource } from './TrailingAssistantPatchTurnBodyScopePlanHelper';

export type TrailingAssistantPatchSuccessPlanningContextPlanBaseSource =
  TrailingAssistantPatchExecutionTailPlanningContextSource &
  TrailingAssistantPatchTurnBodyScopePlanSource;

export type TrailingAssistantPatchSuccessPlanningContextPlanSource =
  TrailingAssistantPatchSuccessPlanningContextPlanBaseSource & {
    getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
    summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
  };

export type TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort = {
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
};

export type TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts = {
  planningContext: TrailingAssistantPatchSuccessPlanningContextPlanBaseSource;
  assistantTailRender: TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract(
  parts: TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts,
): TrailingAssistantPatchSuccessPlanningContextPlanSource {
  return {
    ...parts.planningContext,
    getBodySignature: (message) => parts.assistantTailRender.getBodySignature(message),
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}
