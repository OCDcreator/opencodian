import type { ChatMessage } from '../../../core/types';

type TrailingAssistantPatchExecutionPlanPatchTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

export type TrailingAssistantPatchExecutionPlan =
  | {
    kind: 'finalize-footer';
    messageEl: HTMLElement;
    nextTailMessage: ChatMessage;
  }
  | {
    kind: 'rerender-content';
    messageEl: HTMLElement;
    contentEl: HTMLElement;
    nextTailMessage: ChatMessage;
  };

export type TrailingAssistantPatchExecutionPlanSource = {
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchExecutionPlanPatchTarget;
  shouldFinalizeFooterOnly: boolean;
};

export function buildTrailingAssistantPatchExecutionPlan(
  source: TrailingAssistantPatchExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan {
  if (source.shouldFinalizeFooterOnly) {
    return {
      kind: 'finalize-footer',
      messageEl: source.patchTarget.messageEl,
      nextTailMessage: source.nextTailMessage,
    };
  }

  return {
    kind: 'rerender-content',
    messageEl: source.patchTarget.messageEl,
    contentEl: source.patchTarget.contentEl,
    nextTailMessage: source.nextTailMessage,
  };
}
