import type { ChatMessage } from '../../../core/types';

type TrailingAssistantPatchTailOutcomePatchTarget = {
  messageEl: HTMLElement;
};

type TrailingAssistantPatchTailOutcomeSourceFields = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchTailOutcomePatchTarget;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailOutcomeInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContextSource =
  TrailingAssistantPatchTailOutcomeSourceFields;
export type TrailingAssistantPatchTailOutcomePlanningContext =
  TrailingAssistantPatchTailOutcomeInputs;

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return buildTrailingAssistantPatchTailOutcomePlanningContextFromInputs(
    buildTrailingAssistantPatchTailOutcomeInputs(source),
  );
}

function buildTrailingAssistantPatchTailOutcomeInputs(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomeInputs {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    messageEl: source.patchTarget.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

function buildTrailingAssistantPatchTailOutcomePlanningContextFromInputs(
  inputs: TrailingAssistantPatchTailOutcomeInputs,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
