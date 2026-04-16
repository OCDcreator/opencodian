import type { ChatMessage } from '../../../core/types';

type TrailingAssistantPatchTailOutcomePlanningContextInputsPatchTarget = {
  messageEl: HTMLElement;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchTailOutcomePlanningContextInputsPatchTarget;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailOutcomePlanningContextInputs = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailOutcomePlanningContextInputs(
  source: TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
): TrailingAssistantPatchTailOutcomePlanningContextInputs {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    messageEl: source.patchTarget.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}
