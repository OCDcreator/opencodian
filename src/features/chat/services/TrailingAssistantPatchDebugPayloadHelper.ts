import type { ChatMessage } from '../../../core/types';

export type TrailingAssistantPatchCompletionDebugPayloadInputs = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchCompletionDebugPayloadPlan = {
  shouldStickToBottom: boolean;
  previousTail: Record<string, unknown> | null;
  nextTail: Record<string, unknown> | null;
};

export type TrailingAssistantPatchSkippedDebugCountPlan = {
  previousRenderedCount: number;
  nextRenderedCount: number;
};

export type TrailingAssistantPatchSkippedDebugPayloadInputs = {
  reason: string;
  payload: Record<string, unknown>;
  countPlan: TrailingAssistantPatchSkippedDebugCountPlan;
};

export type TrailingAssistantPatchSkippedDebugPayloadPlan =
  Record<string, unknown> & {
    reason: string;
    previousRenderedCount: number;
    nextRenderedCount: number;
  };

type TrailingAssistantPatchSkippedDebugCountPlanInputs = {
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
};

type TrailingAssistantPatchSkippedDebugPayloadInputSource = {
  reason: string;
  payload: Record<string, unknown>;
  previousMessages: ChatMessage[];
  nextMessages: ChatMessage[];
  getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
};

export function buildTrailingAssistantPatchCompletionDebugPayloadInputs(
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPayloadInputs,
): TrailingAssistantPatchCompletionDebugPayloadInputs {
  return {
    shouldStickToBottom: completionDebugPlan.shouldStickToBottom,
    previousTail: completionDebugPlan.previousTail,
    nextTail: completionDebugPlan.nextTail,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchCompletionDebugPayloadInputs,
): TrailingAssistantPatchCompletionDebugPayloadPlan {
  return {
    shouldStickToBottom: payloadInputs.shouldStickToBottom,
    previousTail: payloadInputs.previousTail,
    nextTail: payloadInputs.nextTail,
  };
}

export function buildTrailingAssistantPatchSkippedDebugPayloadInputs(
  payloadInputSource: TrailingAssistantPatchSkippedDebugPayloadInputSource,
): TrailingAssistantPatchSkippedDebugPayloadInputs {
  return {
    reason: payloadInputSource.reason,
    payload: payloadInputSource.payload,
    countPlan: buildTrailingAssistantPatchSkippedDebugCountPlan({
      previousMessages: payloadInputSource.previousMessages,
      nextMessages: payloadInputSource.nextMessages,
      getMessagesForRender: payloadInputSource.getMessagesForRender,
    }),
  };
}

export function buildTrailingAssistantPatchSkippedDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchSkippedDebugPayloadInputs,
): TrailingAssistantPatchSkippedDebugPayloadPlan {
  return {
    reason: payloadInputs.reason,
    previousRenderedCount: payloadInputs.countPlan.previousRenderedCount,
    nextRenderedCount: payloadInputs.countPlan.nextRenderedCount,
    ...payloadInputs.payload,
  };
}

function buildTrailingAssistantPatchSkippedDebugCountPlan(
  inputs: TrailingAssistantPatchSkippedDebugCountPlanInputs,
): TrailingAssistantPatchSkippedDebugCountPlan {
  return {
    previousRenderedCount:
      inputs.getMessagesForRender(inputs.previousMessages).length,
    nextRenderedCount:
      inputs.getMessagesForRender(inputs.nextMessages).length,
  };
}
