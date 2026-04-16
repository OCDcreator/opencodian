import type { ChatMessage } from '../../../core/types';

type TrailingAssistantPatchExecutionTailPatchTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

type TrailingAssistantPatchExecutionTailContextFields = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchExecutionTailPatchTarget;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchExecutionTailPlanningContextSource =
  TrailingAssistantPatchExecutionTailContextFields;
type TrailingAssistantPatchExecutionTailInputs = TrailingAssistantPatchExecutionTailContextFields;
export type TrailingAssistantPatchExecutionTailPlanningContext =
  TrailingAssistantPatchExecutionTailContextFields;

export function buildTrailingAssistantPatchExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailPlanningContextSource,
): TrailingAssistantPatchExecutionTailPlanningContext {
  return buildTrailingAssistantPatchExecutionTailPlanningContextFromInputs(
    buildTrailingAssistantPatchExecutionTailInputs(source),
  );
}

function buildTrailingAssistantPatchExecutionTailInputs(
  source: TrailingAssistantPatchExecutionTailPlanningContextSource,
): TrailingAssistantPatchExecutionTailInputs {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    patchTarget: source.patchTarget,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

function buildTrailingAssistantPatchExecutionTailPlanningContextFromInputs(
  inputs: TrailingAssistantPatchExecutionTailInputs,
): TrailingAssistantPatchExecutionTailPlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    patchTarget: inputs.patchTarget,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}
