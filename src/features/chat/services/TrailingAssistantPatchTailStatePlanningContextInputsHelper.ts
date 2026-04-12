import type { ChatMessage } from '../../../core/types';

export type TrailingAssistantPatchTailStatePlanningContextInputsSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchTailStatePlanningContextInputs = {
  nextTailMessage: ChatMessage;
  messageEl: HTMLElement;
  shouldStickToBottom: boolean;
};

export function buildTrailingAssistantPatchTailStatePlanningContextInputs(
  source: TrailingAssistantPatchTailStatePlanningContextInputsSource,
): TrailingAssistantPatchTailStatePlanningContextInputs {
  return {
    nextTailMessage: source.nextTailMessage,
    messageEl: source.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}
