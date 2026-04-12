import type { TrailingAssistantPatchTailStatePlan } from './TrailingAssistantPatchTailStateApplierHelper';
import {
  buildTrailingAssistantPatchTailStatePlanningContext,
  type TrailingAssistantPatchTailStatePlanningContextSource,
} from './TrailingAssistantPatchTailStatePlanningContextHelper';

export type TrailingAssistantPatchTailStateTailOutcomePlanSource =
  TrailingAssistantPatchTailStatePlanningContextSource;

export function buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailStateTailOutcomePlanSource,
): TrailingAssistantPatchTailStatePlan {
  const planningContext = buildTrailingAssistantPatchTailStatePlanningContext(source);

  return {
    messageEl: planningContext.messageEl,
    messageId: planningContext.nextTailMessage.id,
    sourceMessageId: planningContext.nextTailMessage.sourceMessageId ?? null,
    shouldStickToBottom: planningContext.shouldStickToBottom,
  };
}
