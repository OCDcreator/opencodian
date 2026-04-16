import type { TrailingAssistantPatchTailOutcomePlanningContextInputs } from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';

export type TrailingAssistantPatchTailOutcomePlanningContextShapeInputs =
  TrailingAssistantPatchTailOutcomePlanningContextInputs;

export type TrailingAssistantPatchTailOutcomePlanningContext =
  TrailingAssistantPatchTailOutcomePlanningContextShapeInputs;

export function buildTrailingAssistantPatchTailOutcomePlanningContextShape(
  inputs: TrailingAssistantPatchTailOutcomePlanningContextShapeInputs,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
