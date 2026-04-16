import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';

type TrailingAssistantPatchCompletionDebugPlanLike = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugLoggingContext = {
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlanLike;
  tabId: TabId | null;
};

export type TrailingAssistantPatchSkippedDebugPlanningContext = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  tabId: TabId | null;
};

export type TrailingAssistantPatchSkippedDebugLoggingContext = {
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext;
  reason: string;
  payload: Record<string, unknown>;
};

export function buildTrailingAssistantPatchCompletionDebugLoggingContext(
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlanLike,
  tabId: TabId | null,
): TrailingAssistantPatchCompletionDebugLoggingContext {
  return {
    completionDebugPlan,
    tabId,
  };
}

export function buildTrailingAssistantPatchSkippedDebugPlanningContext(
  previousMessages: ChatMessage[],
  nextMessages: ChatMessage[],
  tabId: TabId | null,
): TrailingAssistantPatchSkippedDebugPlanningContext {
  return {
    previousMessages,
    nextMessages,
    tabId,
  };
}

export function buildTrailingAssistantPatchSkippedDebugLoggingContext(
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
  reason: string,
  payload: Record<string, unknown>,
): TrailingAssistantPatchSkippedDebugLoggingContext {
  return {
    planningContext,
    reason,
    payload,
  };
}
