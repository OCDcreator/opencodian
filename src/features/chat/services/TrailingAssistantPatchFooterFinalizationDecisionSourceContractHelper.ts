import type { ChatMessage } from '../../../core/types';
import type { TrailingAssistantPatchExecutionTailPlanningContext } from './TrailingAssistantPatchExecutionTailPlanningContextHelper';
import type { TrailingAssistantPatchFooterFinalizationDecisionSource } from './TrailingAssistantPatchFooterFinalizationDecisionHelper';

export type TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter = (
  message: ChatMessage,
) => string;

export type TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts = {
  planningContext: TrailingAssistantPatchExecutionTailPlanningContext;
  getBodySignature: TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter;
};

export function buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract(
  parts: TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts,
): TrailingAssistantPatchFooterFinalizationDecisionSource {
  return {
    previousBodySignature: parts.getBodySignature(parts.planningContext.previousTailMessage),
    nextBodySignature: parts.getBodySignature(parts.planningContext.nextTailMessage),
  };
}
