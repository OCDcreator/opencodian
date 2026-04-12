import type { ChatMessage } from '../../../core/types';

type TrailingAssistantPatchTailStateSourceFields = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailStateInputs = Omit<
  TrailingAssistantPatchTailStateSourceFields,
  'previousTailMessage'
>;

export type TrailingAssistantPatchTailStatePlanningContextSource =
  TrailingAssistantPatchTailStateSourceFields;
export type TrailingAssistantPatchTailStatePlanningContext =
  TrailingAssistantPatchTailStateInputs;

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStatePlanningContext {
  return buildTrailingAssistantPatchTailStatePlanningContextFromInputs(
    buildTrailingAssistantPatchTailStateInputs(source),
  );
}

function buildTrailingAssistantPatchTailStateInputs(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStateInputs {
  return {
    nextTailMessage: source.nextTailMessage,
    messageEl: source.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

function buildTrailingAssistantPatchTailStatePlanningContextFromInputs(
  inputs: TrailingAssistantPatchTailStateInputs,
): TrailingAssistantPatchTailStatePlanningContext {
  return {
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
