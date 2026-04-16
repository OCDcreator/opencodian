import type { ChatMessage } from '../../../core/types';

export type TrailingAssistantPatchCompletionDebugMessageSummarizer = (
  message: ChatMessage | null | undefined,
) => Record<string, unknown> | null;

export type TrailingAssistantPatchCompletionDebugSummaryPlan = {
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugSummaryPlanSource = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  summarizeChatMessageForDebug: TrailingAssistantPatchCompletionDebugMessageSummarizer;
};

export function buildTrailingAssistantPatchCompletionDebugSummaryPlan(
  source: TrailingAssistantPatchCompletionDebugSummaryPlanSource,
): TrailingAssistantPatchCompletionDebugSummaryPlan {
  return {
    previousTail: source.summarizeChatMessageForDebug(source.previousTailMessage),
    nextTail: source.summarizeChatMessageForDebug(source.nextTailMessage),
  };
}
