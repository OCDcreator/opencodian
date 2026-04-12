import type { TrailingAssistantPatchTailStatePlanningContextInputs } from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';

export type TrailingAssistantPatchTailStatePlanningContextShapeInputs =
  TrailingAssistantPatchTailStatePlanningContextInputs;

export type TrailingAssistantPatchTailStatePlanningContext =
  TrailingAssistantPatchTailStatePlanningContextShapeInputs;

export function buildTrailingAssistantPatchTailStatePlanningContextShape(
  inputs: TrailingAssistantPatchTailStatePlanningContextShapeInputs,
): TrailingAssistantPatchTailStatePlanningContext {
  return {
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
