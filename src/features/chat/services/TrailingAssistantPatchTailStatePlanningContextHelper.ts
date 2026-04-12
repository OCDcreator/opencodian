import {
  buildTrailingAssistantPatchTailStatePlanningContextInputs,
  type TrailingAssistantPatchTailStatePlanningContextInputs,
  type TrailingAssistantPatchTailStatePlanningContextInputsSource,
} from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';

export type TrailingAssistantPatchTailStatePlanningContextSource =
  TrailingAssistantPatchTailStatePlanningContextInputsSource;
export type TrailingAssistantPatchTailStatePlanningContext =
  TrailingAssistantPatchTailStatePlanningContextInputs;

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStatePlanningContext {
  return buildTrailingAssistantPatchTailStatePlanningContextFromInputs(
    buildTrailingAssistantPatchTailStatePlanningContextInputs(source),
  );
}

function buildTrailingAssistantPatchTailStatePlanningContextFromInputs(
  inputs: TrailingAssistantPatchTailStatePlanningContextInputs,
): TrailingAssistantPatchTailStatePlanningContext {
  return {
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
