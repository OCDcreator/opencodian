import {
  buildTrailingAssistantPatchTailOutcomePlanningContextInputs,
  type TrailingAssistantPatchTailOutcomePlanningContextInputs,
  type TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
} from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';

export type TrailingAssistantPatchTailOutcomePlanningContextSource =
  TrailingAssistantPatchTailOutcomePlanningContextInputsSource;
export type TrailingAssistantPatchTailOutcomePlanningContext =
  TrailingAssistantPatchTailOutcomePlanningContextInputs;

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return buildTrailingAssistantPatchTailOutcomePlanningContextFromInputs(
    buildTrailingAssistantPatchTailOutcomePlanningContextInputs(source),
  );
}

function buildTrailingAssistantPatchTailOutcomePlanningContextFromInputs(
  inputs: TrailingAssistantPatchTailOutcomePlanningContextInputs,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
