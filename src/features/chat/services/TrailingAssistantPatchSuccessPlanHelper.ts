import type { ChatMessage } from '../../../core/types';
import type { TrailingAssistantPatchTailOutcomePlans } from './TrailingAssistantPatchTailOutcomePlanHelper';
import type { TrailingAssistantPatchTurnBodyScopePlan } from './TrailingAssistantPatchTurnBodyScopeHelper';

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

export type TrailingAssistantPatchSuccessPlan = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailStatePlan: TrailingAssistantPatchTailOutcomePlans['tailStatePlan'];
  completionDebugPlan: TrailingAssistantPatchTailOutcomePlans['completionDebugPlan'];
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export type TrailingAssistantPatchSuccessPlanParts = {
  executionPlan: TrailingAssistantPatchExecutionPlan;
  tailOutcomePlans: TrailingAssistantPatchTailOutcomePlans;
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan;
};

export function buildTrailingAssistantPatchSuccessPlanFromParts(
  planParts: TrailingAssistantPatchSuccessPlanParts,
): TrailingAssistantPatchSuccessPlan {
  return {
    executionPlan: planParts.executionPlan,
    tailStatePlan: planParts.tailOutcomePlans.tailStatePlan,
    completionDebugPlan: planParts.tailOutcomePlans.completionDebugPlan,
    turnBodyScopePlan: planParts.turnBodyScopePlan,
  };
}
